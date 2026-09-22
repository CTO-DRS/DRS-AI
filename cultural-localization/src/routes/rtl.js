const router=require('express').Router();
router.post('/detect',(req,res)=>res.json(req.app.locals.rtlService.apply(req.body?.text||'')));
module.exports=router;
