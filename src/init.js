/* globals api */

go.init = function() {
  var vumigo = require("vumigo_v02");
  var InteractionMachine = vumigo.InteractionMachine;
  var GoMenConnect = go.app.GoMenConnect;

  return {
    im: new InteractionMachine(api, new GoMenConnect())
  };
}();
