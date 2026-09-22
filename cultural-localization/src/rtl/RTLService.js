class RTLService {
  async initialize(){ return true; }
  detect(text=''){ return /[\u0590-\u08FF]/.test(String(text)); }
  apply(text=''){ return { text:String(text), direction:this.detect(text)?'rtl':'ltr' }; }
  async shutdown(){}
}
module.exports = RTLService;
