import { Router } from 'express';
import { agentRegistry } from '../agents';
import logger from '../utils/logger';

const router = Router();

// List all agents
router.get('/', (req, res) => {
  try {
    const agents = agentRegistry.getAllAgents().map(agent => ({
      id: agent.getId(),
      name: agent.getName(),
      capabilities: agent.getCapabilities()
    }));

    res.json({
      success: true,
      data: { agents }
    });
  } catch (error: any) {
    logger.error('Failed to list agents:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'AGENTS_FETCH_FAILED',
        message: error.message
      }
    });
  }
});

// Get agent details
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const agent = agentRegistry.getAgent(id);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'AGENT_NOT_FOUND',
          message: `Agent ${id} not found`
        }
      });
    }

    res.json({
      success: true,
      data: {
        agent: {
          id: agent.getId(),
          name: agent.getName(),
          capabilities: agent.getCapabilities()
        }
      }
    });
  } catch (error: any) {
    logger.error(`Failed to get agent ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: {
        code: 'AGENT_FETCH_FAILED',
        message: error.message
      }
    });
  }
});

// Route task to appropriate agent
router.post('/route', async (req, res) => {
  try {
    const { input } = req.body;
    
    if (!input) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_INPUT',
          message: 'Input is required'
        }
      });
    }

    const routing = agentRegistry.routeTask(input);

    if (!routing) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NO_AGENT_FOUND',
          message: 'No suitable agent found for this input'
        }
      });
    }

    res.json({
      success: true,
      data: {
        agent: {
          id: routing.agent.getId(),
          name: routing.agent.getName(),
          capabilities: routing.agent.getCapabilities()
        },
        confidence: routing.confidence
      }
    });
  } catch (error: any) {
    logger.error('Failed to route task:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ROUTING_FAILED',
        message: error.message
      }
    });
  }
});

export default router;
