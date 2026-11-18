const router=require('express').Router();
router.get('/guidance',(req,res)=>res.json(req.app.locals.localCustomsService.getGuidance(req.query.region||'gulf')));
module.exports=router;
