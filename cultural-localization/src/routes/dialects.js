const router=require('express').Router();
router.get('/',(req,res)=>res.json({supported:['moroccan','gulf','egyptian','levantine']}));
router.post('/detect',(req,res)=>res.json(req.app.locals.dialectService.detect(req.body?.text||'')));
router.post('/localize',(req,res)=>res.json(req.app.locals.dialectService.localize(req.body?.text||'',req.body?.dialect||'gulf')));
module.exports=router;
