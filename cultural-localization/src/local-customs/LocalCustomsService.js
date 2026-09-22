class LocalCustomsService {
  async initialize(){ return true; }
  getGuidance(region='gulf'){ return { region, guidance:'Use culturally respectful and context-appropriate language.' }; }
  async shutdown(){}
}
module.exports = LocalCustomsService;
