class DialectService {
  constructor(){ this.dialects = ['moroccan','gulf','egyptian','levantine']; }
  async initialize(){ return true; }
  detect(text=''){ const s=String(text); return /شلون|وش|يا هلا/.test(s)?'gulf':'unknown'; }
  localize(text='', dialect='gulf'){ return { text:String(text), dialect, supported:this.dialects.includes(dialect) }; }
  async shutdown(){}
}
module.exports = DialectService;
