const router=require('express').Router();
router.post('/analyze',(req,res)=>res.json(req.app.locals.culturalContextService.analyze(req.body?.text||'')));
module.exports=router;
