var go = {};
go;

go.RapidPro = function() {
    var vumigo = require('vumigo_v02');
    var url_utils = require('url');
    var events = vumigo.events;
    var Eventable = events.Eventable;

    var RapidPro = Eventable.extend(function(self, json_api, base_url, auth_token) {
        self.json_api = json_api;
        self.base_url = base_url;
        self.auth_token = auth_token;
        self.json_api.defaults.headers.Authorization = ['Token ' + self.auth_token];
        self.json_api.defaults.headers['User-Agent'] = ['NDoH-JSBox/RapidPro'];

        self.get_contact = function(filters) {
            filters = filters || {};
            var url = self.base_url + "/api/v2/contacts.json";

            return self.json_api.get(url, {params: filters})
                .then(function(response){
                    var contacts = response.data.results;
                    if(contacts.length > 0){
                        return contacts[0];
                    }
                    else {
                        return null;
                    }
                });
        };

        self.update_contact = function(filter, details) {
            var url = self.base_url + "/api/v2/contacts.json";
            return self.json_api.post(url, {params: filter, data: details})
                .then(function(response) {
                    return response.data;
                });
        };

        self.create_contact = function(details) {
            var url = self.base_url + "/api/v2/contacts.json";
            return self.json_api.post(url, {data: details})
                .then(function(response) {
                    return response.data;
                });
        };

        self._get_paginated_response = function(url, params) {
            /* Gets all the pages of a paginated response */
            return self.json_api.get(url, {params: params})
                .then(function(response){
                    var results = response.data.results;
                    if(response.data.next === null) {
                        return results;
                    }

                    var query = url_utils.parse(response.data.next).query;
                    return self._get_paginated_response(url, query)
                        .then(function(response) {
                            return results.concat(response);
                        });
                });
        };

        self.get_flows = function(filter) {
            var url = self.base_url + "/api/v2/flows.json";
            return self._get_paginated_response(url, filter);
        };

        self.get_flow_by_name = function(name) {
            name = name.toLowerCase().trim();
            return self.get_flows().then(function(flows){
                flows = flows.filter(function(flow) {
                    return flow.name.toLowerCase().trim() === name;
                });
                if(flows.length > 0) {
                    return flows[0];
                } else {
                    return null;
                }
            });
        };

        self.start_flow = function(flow_uuid, contact_uuid, contact_urn, extra) {
            var url = self.base_url + "/api/v2/flow_starts.json";
            var data = {flow: flow_uuid};
            if(contact_uuid) {
                data.contacts = [contact_uuid];
            }
            if(contact_urn) {
                data.urns = [contact_urn];
            }
            if(extra) {
                data.extra = extra;
            }
            return self.json_api.post(url, {data: data});
        };
    });

    return RapidPro;
}();
go.Whatsapp = (function() {
  var vumigo = require("vumigo_v02");
  var events = vumigo.events;
  var Eventable = events.Eventable;
  var _ = require("lodash");
  var url = require("url");

  var Whatsapp = Eventable.extend(function(self, json_api, base_url, token) {
    self.json_api = json_api;
    self.base_url = base_url;
    self.json_api.defaults.headers.Authorization = ["Bearer " + token];
    self.json_api.defaults.headers["Content-Type"] = ["application/json"];

    self.contact_check = function(msisdn, block) {
      return self.json_api
        .post(url.resolve(self.base_url, "v1/contacts"), {
          data: {
            blocking: block ? "wait" : "no_wait",
            contacts: [msisdn]
          }
        })
        .then(function(response) {
          var existing = _.filter(response.data.contacts, function(obj) {
            return obj.status === "valid";
          });
          return !_.isEmpty(existing);
        });
    };

    self.LANG_MAP = {
      zul_ZA: "en",
      xho_ZA: "en",
      afr_ZA: "af",
      eng_ZA: "en",
      nso_ZA: "en",
      tsn_ZA: "en",
      sot_ZA: "en",
      tso_ZA: "en",
      ssw_ZA: "en",
      ven_ZA: "en",
      nbl_ZA: "en"
    };
  });

  return Whatsapp;
})();

go.app = (function() {
  var _ = require("lodash");
  var vumigo = require("vumigo_v02");
  var utils = require("seed-jsbox-utils").utils;
  var App = vumigo.App;
  var Choice = vumigo.states.Choice;
  var EndState = vumigo.states.EndState;
  var JsonApi = vumigo.http.api.JsonApi;
  var MenuState = vumigo.states.MenuState;

  var GoMenConnect = App.extend(function(self) {
    App.call(self, "state_start");
    var $ = self.$;

    self.init = function() {
      self.rapidpro = new go.RapidPro(
        new JsonApi(self.im, {
          headers: { "User-Agent": ["Jsbox/MenConnect-Registration"] }
        }),
        self.im.config.services.rapidpro.base_url,
        self.im.config.services.rapidpro.token
      );
      self.whatsapp = new go.Whatsapp(
        new JsonApi(self.im, {
          headers: { "User-Agent": ["Jsbox/MenConnect-Registration"] }
        }),
        self.im.config.services.whatsapp.base_url,
        self.im.config.services.whatsapp.token
      );
    };

    self.contact_in_group = function(contact, groups) {
      var contact_groupids = _.map(_.get(contact, "groups", []), "uuid");
      return _.intersection(contact_groupids, groups).length > 0;
    };

    self.add = function(name, creator) {
      self.states.add(name, function(name, opts) {
        if (self.im.msg.session_event !== "new") return creator(name, opts);

        var timeout_opts = opts || {};
        timeout_opts.name = name;
        return self.states.create("state_timed_out", timeout_opts);
      });
    };

    self.states.add("state_timed_out", function(name, creator_opts) {
      return new MenuState(name, {
        question: $("Welcome back. Please select an option:"),
        choices: [
          new Choice(creator_opts.name, $("Continue signing up for messages")),
          new Choice("state_start", $("Main menu"))
        ]
      });
    });

    self.states.add("state_start", function(name, opts) {
      // Reset user answers when restarting the app
      self.im.user.answers = {};

      var msisdn = utils.normalize_msisdn(self.im.user.addr, "ZA");
      // Fire and forget a background whatsapp contact check
      self.whatsapp.contact_check(msisdn, false).then(_.noop, _.noop);

      return self.rapidpro
        .get_contact({ urn: "whatsapp:" + _.trim(msisdn, "+") })
        .then(function(contact) {
          self.im.user.set_answer("contact", contact);
        })
        .then(function() {
          // Delegate to the correct state depending on group membership
          var contact = self.im.user.get_answer("contact");
          if (
            self.contact_in_group(
              contact,
              self.im.config.registration_group_ids
            )
          ) {
            return self.states.create("state_registered");
          } else {
            return self.states.create("state_info_consent");
          }
        })
        .catch(function(e) {
          // Go to error state after 3 failed HTTP requests
          opts.http_error_count = _.get(opts, "http_error_count", 0) + 1;
          if (opts.http_error_count === 3) {
            self.im.log.error(e.message);
            return self.states.create("__error__");
          }
          return self.states.create("state_start", opts);
        });
    });

    self.states.add("state_registered", function(name) {
      return new EndState(name, {
        next: "state_start",
        text: $("Hello You are already registered for Menconnect")
      });
    });

    self.add("state_info_consent", function(name) {
      // Skip this state if we already have consent
      var consent = _.get(
        self.im.user.get_answer("contact"),
        "fields.info_consent"
      );
      if (consent === "TRUE") {
        return self.states.create("state_message_consent");
      }
      return new MenuState(name, {
        question: $(
          "MenConnect needs to process your personal info to send you relevant messages. Do you agree?"
        ),
        error: $(
          "Sorry, please reply with the number next to your answer. Do you agree?"
        ),
        accept_labels: true,
        choices: [
          new Choice("state_message_consent", $("Yes")),
          new Choice("state_exit", $("No"))
        ]
      });
    });

    self.add("state_message_consent", function(name) {
      // Skip this state if we already have consent
      var consent = _.get(
        self.im.user.get_answer("contact"),
        "fields.messaging_consent"
      );
      if (consent === "TRUE") {
        return self.states.create("state_research_consent");
      }
      return new MenuState(name, {
        question: $(
          "Do you agree to receiving messages from MenConnect? This may include receiving messages on " +
            "public holidays and weekends."
        ),
        error: $(
          "Sorry, please reply with the number next to your answer. Do you agree to receiving messages " +
            "from MenConnect?"
        ),
        accept_labels: true,
        choices: [
          new Choice("state_whatsapp_contact_check", $("Yes")),
          new Choice("state_message_consent_denied", $("No"))
        ]
      });
    });

    self.add("state_message_consent_denied", function(name) {
      return new MenuState(name, {
        question: $(
          "Unfortunately, without agreeing we can't send MenConnect to you. " +
            "Do you want to agree to get messages from MenConnect?"
        ),
        error: $(
          "Sorry, please reply with the number next to your answer. You've chosen not to receive " +
            "MenConnect messages and so cannot complete registration."
        ),
        accept_labels: true,
        choices: [
          new Choice("state_message_consent", $("Yes")),
          new Choice("state_exit", $("No"))
        ]
      });
    });

    self.states.add("state_exit", function(name) {
      return new EndState(name, {
        next: "state_start",
        text: $(
          "Thank you for considering MenConnect. We respect your decision. Have a lovely day."
        )
      });
    });

    self.add("state_whatsapp_contact_check", function(name, opts) {
      var msisdn = utils.normalize_msisdn(self.im.user.addr, "ZA");
      return self.whatsapp
        .contact_check(msisdn, true)
        .then(function(result) {
          self.im.user.set_answer("on_whatsapp", result);
          return self.states.create("state_trigger_rapidpro_flow");
        })
        .catch(function(e) {
          // Go to error state after 3 failed HTTP requests
          opts.http_error_count = _.get(opts, "http_error_count", 0) + 1;
          if (opts.http_error_count === 3) {
            self.im.log.error(e.message);
            return self.states.create("__error__", {
              return_state: "state_whatsapp_contact_check"
            });
          }
          return self.states.create("state_whatsapp_contact_check", opts);
        });
    });

    self.add("state_trigger_rapidpro_flow", function(name, opts) {
      var msisdn = utils.normalize_msisdn(self.im.user.addr, "ZA");
      return self.rapidpro
        .start_flow(
          self.im.config.flow_uuid,
          null,
          "whatsapp:" + _.trim(msisdn, "+"),
          {
            on_whatsapp: self.im.user.get_answer("on_whatsapp")
              ? "TRUE"
              : "FALSE",
            source: "USSD registration"
          }
        )
        .then(function() {
          return self.states.create("state_registration_complete");
        })
        .catch(function(e) {
          // Go to error state after 3 failed HTTP requests
          opts.http_error_count = _.get(opts, "http_error_count", 0) + 1;
          if (opts.http_error_count === 3) {
            self.im.log.error(e.message);
            return self.states.create("__error__", {
              return_state: "state_trigger_rapidpro_flow"
            });
          }
          return self.states.create("state_trigger_rapidpro_flow", opts);
        });
    });

    self.states.add("state_registration_complete", function(name) {
      var msisdn = utils.readable_msisdn(
        utils.normalize_msisdn(self.im.user.addr, "ZA"),
        "27"
      );
      return new EndState(name, {
        next: "state_start",
        text: $(
          "You're done! This number {{ msisdn }} will get helpful messages from MenConnect"
        ).context({ msisdn: msisdn })
      });
    });

    self.states.creators.__error__ = function(name, opts) {
      var return_state = opts.return_state || "state_start";
      return new EndState(name, {
        next: return_state,
        text: $(
          "Sorry, something went wrong. We have been notified. Please try again later"
        )
      });
    };
  });

  return {
    GoMenConnect: GoMenConnect
  };
})();

/* globals api */

go.init = function() {
  var vumigo = require("vumigo_v02");
  var InteractionMachine = vumigo.InteractionMachine;
  var GoMenConnect = go.app.GoMenConnect;

  return {
    im: new InteractionMachine(api, new GoMenConnect())
  };
}();
