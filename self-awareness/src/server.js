const express=require('express'); const cors=require('cors'); const helmet=require('helmet');
const app=express(); const port=Number(process.env.PORT||3037);
app.use(helmet()); app.use(cors()); app.use(express.json());
app.get('/health',(req,res)=>res.json({status:'ok',service:'drs-ai-self-awareness',timestamp:new Date().toISOString()}));
app.get('/api/v1/self-awareness',(req,res)=>res.json({status:'operational',transparency:process.env.TRANSPARENCY_LEVEL||'high',epistemicUncertainty:process.env.EPISTEMIC_UNCERTAINTY==='true'}));
app.listen(port,()=>console.log(`DRS AI Self-Awareness running on ${port}`));
