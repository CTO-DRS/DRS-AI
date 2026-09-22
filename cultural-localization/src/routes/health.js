const router=require('express').Router();
router.get('/',(req,res)=>res.json({status:'ok',service:'drs-ai-cultural-localization'}));
module.exports=router;
