import { Router } from 'express';
import multer from 'multer';
import securityAnalyzer from '../services/SecurityAnalyzer';
import logger from '../utils/logger';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Analyze URL/Link
router.post('/analyze/link', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: { code: 'NO_URL', message: 'No URL provided' } });
    }

    const result = await securityAnalyzer.analyzeLink(url);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Link analysis failed:', error);
    res.status(500).json({ success: false, error: { code: 'ANALYSIS_FAILED', message: error.message } });
  }
});

// Analyze file
router.post('/analyze/file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file provided' } });
    }

    const result = await securityAnalyzer.analyzeFile(req.file.buffer, req.file.originalname);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('File analysis failed:', error);
    res.status(500).json({ success: false, error: { code: 'ANALYSIS_FAILED', message: error.message } });
  }
});

// Analyze logs
router.post('/analyze/logs', async (req, res) => {
  try {
    const { logs } = req.body;
    
    if (!logs) {
      return res.status(400).json({ success: false, error: { code: 'NO_LOGS', message: 'No logs provided' } });
    }

    const result = await securityAnalyzer.analyzeLogs(logs);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Log analysis failed:', error);
    res.status(500).json({ success: false, error: { code: 'ANALYSIS_FAILED', message: error.message } });
  }
});

// Analyze password
router.post('/analyze/password', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ success: false, error: { code: 'NO_PASSWORD', message: 'No password provided' } });
    }

    const result = securityAnalyzer.analyzePassword(password);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Password analysis failed:', error);
    res.status(500).json({ success: false, error: { code: 'ANALYSIS_FAILED', message: error.message } });
  }
});

// Batch URL analysis
router.post('/analyze/links/batch', async (req, res) => {
  try {
    const { urls } = req.body;
    
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'NO_URLS', message: 'No URLs provided' } });
    }

    const results = await Promise.all(
      urls.map(url => securityAnalyzer.analyzeLink(url))
    );

    const summary = {
      total: results.length,
      suspicious: results.filter(r => r.isSuspicious).length,
      highRisk: results.filter(r => r.riskScore >= 50).length
    };

    res.json({ success: true, data: { results, summary } });
  } catch (error: any) {
    logger.error('Batch link analysis failed:', error);
    res.status(500).json({ success: false, error: { code: 'ANALYSIS_FAILED', message: error.message } });
  }
});

// Get security tips
router.get('/tips', async (req, res) => {
  const tips = [
    {
      category: 'Passwords',
      tips: [
        'Use unique passwords for each account',
        'Enable two-factor authentication when available',
        'Use a password manager to generate and store strong passwords',
        'Never share your passwords with anyone'
      ]
    },
    {
      category: 'Phishing',
      tips: [
        'Verify the sender\'s email address carefully',
        'Don\'t click on suspicious links',
        'Check for HTTPS before entering sensitive information',
        'Be wary of urgent or threatening language'
      ]
    },
    {
      category: 'General',
      tips: [
        'Keep your software and systems updated',
        'Use antivirus and anti-malware software',
        'Regularly backup important data',
        'Be cautious when downloading files from the internet'
      ]
    }
  ];

  res.json({ success: true, data: { tips } });
});

export default router;
