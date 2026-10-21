import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Plan, PlanStep } from '../models';
import { agentRegistry } from '../agents';
import { Task } from '../types';
import logger from '../utils/logger';
import taskService from './taskService';
import eventBus from './eventBus';
import mcpService from './mcpService';

/**
 * PlannerService — LLM-driven task decomposition (drSai TaskPlanner).
 *
 * Flow:
 *  1. POST /tasks/:id/plan        → LLM decomposes the task into ordered
 *     steps (JSON), each mapped to a registered agent type; plan is
 *     persisted in Postgres with status "draft".
 *  2. POST /plans/:id/approve     → marks plan approved and creates a
 *     subtask per step (parentTaskId = task), executed sequentially.
 *  3. Steps may also call MCP tools directly (step.mcp) or be pure
 *     LLM agent steps. Results are aggregated back into the plan and
 *     the parent task result.
 */

const ROUTER_URL = process.env.ROUTER_SERVICE_URL || 'http://localhost:3002';

const PLANNER_SYSTEM_PROMPT = `You are a meticulous task planning engine.
Decompose the user's task into an ordered list of concrete steps.
Respond with ONLY a JSON object, no markdown fences, in this exact shape:
{
  "summary": "one-sentence plan summary",
  "steps": [
    { "description": "what to do in this step", "agentType": "chat|code|reasoning|file|automation|builder" }
  ]
}
Rules:
- Use between 2 and 8 steps.
- Each step must be independently executable and build on previous steps.
- Choose the most suitable agentType per step.
- If a step is a tool call, set agentType to "automation" and prefix the description with "TOOL:".`;

export class PlannerService {
  /**
   * Generate (or regenerate) a plan for a task.
   */
  async createPlan(task: Task): Promise<Plan> {
    // Available agent types for the LLM to choose from
    const agentTypes = agentRegistry
      .getAllAgents()
      .map((a) => a.getId())
      .join('|');

    const response = await axios.post(
      `${ROUTER_URL}/chat/generate`,
      {
        model: process.env.PLANNER_MODEL || 'llama3.2',
        prompt: `Task: ${task.input}\n\nAvailable agent types: ${agentTypes}`,
        system: PLANNER_SYSTEM_PROMPT,
        stream: false,
        options: { temperature: 0.2, num_predict: 1500 }
      },
      { timeout: 300000 }
    );

    const raw: string = response.data?.data?.response || '';
    const parsed = this.parsePlannerOutput(raw);

    if (!parsed.steps.length) {
      throw new Error('Planner produced no steps — model output unparseable');
    }

    const steps: PlanStep[] = parsed.steps.map((s) => ({
      id: uuidv4(),
      description: s.description,
      agentType: this.resolveAgentType(s.agentType),
      status: 'pending'
    }));

    // Delete any previous draft plan for this task
    await Plan.destroy({ where: { taskId: task.id, status: 'draft' } });

    const plan = await Plan.create({
      taskId: task.id,
      userId: task.userId,
      summary: parsed.summary || `Plan for: ${task.input.slice(0, 120)}`,
      steps,
      status: 'draft'
    } as any);

    await taskService.updateTask(task.id, { status: 'pending' });
    await eventBus.publish('plan.created', { planId: plan.id, taskId: task.id, steps: steps.length }, task.userId);

    return plan;
  }

  /**
   * Execute an approved/draft plan sequentially, creating subtasks.
   */
  async executePlan(plan: Plan, taskId: string): Promise<Plan> {
    await plan.update({ status: 'executing' } as any);
    const parentTask = await taskService.getTask(taskId);
    if (!parentTask) throw new Error(`Parent task ${taskId} not found`);

    const aggregated: string[] = [];

    try {
      for (const step of plan.steps as PlanStep[]) {
        // Respect cooperative cancellation of the parent task
        const fresh = await taskService.getTask(taskId);
        if (!fresh || fresh.status === 'cancelled') {
          await plan.update({ status: 'failed' } as any);
          return plan;
        }

        await stepStart(plan, step);
        await eventBus.publish('plan.progress', {
          planId: plan.id, taskId, stepId: step.id, status: 'running', description: step.description
        }, plan.userId);

        let result: string;

        if (step.mcp && step.mcp.serverId && step.mcp.tool) {
          // MCP tool-call step
          const call = await mcpService.callTool(step.mcp.serverId, step.mcp.tool, step.mcp.args || {});
          result = JSON.stringify(call).slice(0, 8000);
        } else {
          // Agent step: run as a subtask with plan context
          const subtask = await taskService.createTask(
            plan.userId,
            [
              `You are executing step ${stepIndex(plan, step)} of a larger plan.`,
              `Overall objective: ${parentTask.input}`,
              `Plan summary: ${plan.summary}`,
              `Previous step results:\n${aggregated.map((a, i) => `Step ${i + 1}: ${a.slice(0, 600)}`).join('\n') || '(none)'}`,
              `Your step: ${step.description}`
            ].join('\n\n'),
            step.agentType,
            'normal',
            { planId: plan.id },
            taskId
          );
          const subResult = await taskService.executeTask(subtask.id);
          result = subResult.output;
        }

        step.status = 'completed';
        step.result = result;
        aggregated.push(result);
        await plan.update({ steps: [...plan.steps] } as any);
        await eventBus.publish('plan.progress', {
          planId: plan.id, taskId, stepId: step.id, status: 'completed'
        }, plan.userId);
      }

      const finalOutput = [
        `## Plan: ${plan.summary}`,
        '',
        ...plan.steps.map((s, i) => `### Step ${i + 1} — ${s.description}\n${s.result || ''}`)
      ].join('\n\n');

      await taskService.updateTask(taskId, {
        status: 'completed',
        completedAt: new Date(),
        result: { output: finalOutput, metadata: { planId: plan.id, steps: plan.steps.length } }
      });

      await plan.update({ status: 'completed' } as any);
      await eventBus.publish('plan.completed', { planId: plan.id, taskId }, plan.userId);
      return plan;
    } catch (error: any) {
      logger.error(`Plan ${plan.id} execution failed:`, error);
      await taskService.updateTask(taskId, { status: 'failed', error: `Plan failed: ${error.message}`, completedAt: new Date() });
      await plan.update({ status: 'failed' } as any);
      throw error;
    }
  }

  async getPlan(planId: string, userId: string): Promise<Plan | null> {
    const plan = await Plan.findByPk(planId);
    if (plan && plan.userId !== userId) {
      throw Object.assign(new Error('Access denied'), { statusCode: 403 });
    }
    return plan;
  }

  async getPlanByTask(taskId: string, userId: string): Promise<Plan | null> {
    const plan = await Plan.findOne({ where: { taskId }, order: [['createdAt', 'DESC']] });
    if (plan && plan.userId !== userId) {
      throw Object.assign(new Error('Access denied'), { statusCode: 403 });
    }
    return plan;
  }

  /* ---------------------------------------------------------- */

  private parsePlannerOutput(raw: string): { summary: string; steps: Array<{ description: string; agentType: string }> } {
    // Strip optional markdown fences
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return { summary: '', steps: [] };
    }
    try {
      const obj = JSON.parse(cleaned.slice(start, end + 1));
      const steps = Array.isArray(obj.steps) ? obj.steps : [];
      return {
        summary: typeof obj.summary === 'string' ? obj.summary : '',
        steps: steps
          .filter((s: any) => s && typeof s.description === 'string')
          .slice(0, 8)
          .map((s: any) => ({ description: s.description, agentType: typeof s.agentType === 'string' ? s.agentType : 'chat' }))
      };
    } catch {
      return { summary: '', steps: [] };
    }
  }

  private resolveAgentType(agentType: string): string {
    const valid = agentRegistry.getAllAgents().map((a) => a.getId());
    const normalized = (agentType || 'chat').toLowerCase();
    return valid.includes(normalized) ? normalized : 'chat';
  }
}

/* helpers kept module-level to avoid `this` binding noise */
function stepIndex(plan: Plan, step: PlanStep): number {
  return (plan.steps as PlanStep[]).findIndex((s) => s.id === step.id) + 1;
}

async function stepStart(plan: Plan, step: PlanStep): Promise<void> {
  step.status = 'running';
  await plan.update({ steps: [...plan.steps] } as any);
}

export default new PlannerService();
