import { BaseAgent } from './BaseAgent';
import { ChatAgent } from './ChatAgent';
import { CodeAgent } from './CodeAgent';
import { ReasoningAgent } from './ReasoningAgent';
import { FileAgent } from './FileAgent';
import { AutomationAgent } from './AutomationAgent';
import { BuilderAgent } from './BuilderAgent';
import { Agent } from '../types';
import logger from '../utils/logger';

const agentConfig = require('../../config/agents.json');

export class AgentRegistry {
  private agents: Map<string, BaseAgent> = new Map();

  constructor() {
    this.registerAgents();
  }

  private registerAgents(): void {
    const agents = agentConfig.agents;
    
    for (const [key, config] of Object.entries(agents)) {
      const agentConfig = config as Agent;
      let agent: BaseAgent;

      switch (key) {
        case 'chat':
          agent = new ChatAgent(agentConfig);
          break;
        case 'code':
          agent = new CodeAgent(agentConfig);
          break;
        case 'reasoning':
          agent = new ReasoningAgent(agentConfig);
          break;
        case 'file':
          agent = new FileAgent(agentConfig);
          break;
        case 'automation':
          agent = new AutomationAgent(agentConfig);
          break;
        case 'builder':
          agent = new BuilderAgent(agentConfig);
          break;
        default:
          logger.warn(`Unknown agent type: ${key}`);
          continue;
      }

      this.agents.set(key, agent);
      logger.info(`Registered agent: ${agent.getName()}`);
    }
  }

  getAgent(id: string): BaseAgent | undefined {
    return this.agents.get(id);
  }

  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  findAgentForTask(taskType: string): BaseAgent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.canHandle(taskType)) {
        return agent;
      }
    }
    return undefined;
  }

  routeTask(input: string): { agent: BaseAgent; confidence: number } | null {
    const rules = agentConfig.taskRouting.rules;
    
    for (const rule of rules) {
      const regex = new RegExp(rule.pattern, 'i');
      if (regex.test(input)) {
        const agent = this.agents.get(rule.agent);
        if (agent) {
          return { agent, confidence: rule.confidence };
        }
      }
    }

    // Default to chat agent
    const chatAgent = this.agents.get('chat');
    if (chatAgent) {
      return { agent: chatAgent, confidence: 0.5 };
    }

    return null;
  }
}

export const agentRegistry = new AgentRegistry();
export { BaseAgent, ChatAgent, CodeAgent, ReasoningAgent, FileAgent, AutomationAgent, BuilderAgent };
