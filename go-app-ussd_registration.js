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
        self.json_api.defaults.headers.Authorization = ["Token " + self.auth_token];
        self.json_api.defaults.headers["User-Agent"] = ["Jsbox/MenConnect-Registration"];

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
  var moment = require("moment");
  var Choice = vumigo.states.Choice;
  var ChoiceState = vumigo.states.ChoiceState;
  var FreeText = vumigo.states.FreeText;
  var EndState = vumigo.states.EndState;
  var JsonApi = vumigo.http.api.JsonApi;
  var MenuState = vumigo.states.MenuState;
  var MetricsHelper = require('go-jsbox-metrics-helper');
  const {BigQuery} = require('@google-cloud/bigquery');

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

      self.env = self.im.config.env;
      self.metric_prefix = [self.env, self.im.config.name].join('.');


      self.im.on('state:enter', function(e) {
        if (self.im.config.env === "test"){
          self.im.log.info("in testing environment");
          return null;
        }
        self.im.log.info("in QA env");
        self.im.log.error(self.im.config.services.bigquery.project_id);
        self.im.log.error(self.im.config.services.bigquery.client_email);
        self.im.log.error(self.im.config.services.bigquery.private_key);
        const row = [{message_id: null, chat_id: null, status: "e.state.name", inserted_at: null, updated_at: null, amount: 1}];
        const datasetId = "menconnet_redis";
        const tableId = "status";
        const bigqueryClient = new BigQuery(
            {
                projectId: self.im.config.services.bigquery.project_id,
                credentials: {
                  client_email: self.im.config.services.bigquery.client_email,
                  private_key: self.im.config.services.bigquery.private_key
                }
            }
        );
        self.im.log.info("BigQuery client created");
        // Insert data into a table
        return bigqueryClient.dataset(datasetId).table(tableId).insert(row);
      });
      self.im.on('state:enter', function(e) {
          return self.im.metrics.fire.sum('enter.' + e.state.name, 1);
      });

      var mh = new MetricsHelper(self.im);
      mh
          // Total sum of users for each state for app
          // <env>.ussd_clinic_rapidpro.sum.unique_users last metric,
          // and a <env>.ussd_clinic_rapidpro.sum.unique_users.transient sum metric
          .add.total_unique_users([self.metric_prefix, 'sum', 'unique_users'].join('.'))
      ;

    };

    self.contact_current_channel = function(contact) {
      // Returns the current channel of the contact
      if(_.toUpper(_.get(contact, "fields.preferred_channel", "")) === "WHATSAPP") {
          return $("WhatsApp");
      } else {
          return $("SMS");
      }
  };

  self.contact_alternative_channel = function(contact) {
      // Returns the alternative channel of the contact
      if(_.toUpper(_.get(contact, "fields.preferred_channel", "")) === "WHATSAPP") {
          return $("SMS");
      } else {
          return $("WhatsApp");
      }
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
            return self.states.create("state_message_consent");
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

    var get_content = function(state_name){
      switch (state_name){
        case "state_name_mo":
          return $("One final question from me.\n\nMy name is Mo. What's your name?");
        case "state_hiv":
          return $("What's your question?");
        case "state_treatment":
          return $("What do you want to know?");
        case "state_reminders":
          return $("What would you like to do?");
        case "state_new_clinic_date":
          return $("When is your next expected clinic date?" +
                  "\nReply with the full date in the format YYYY-MM-DD");
        case "state_habit_plan":
          return $("Doing something every day is a habit.\n\nBuild a treatment habit:" +
                  "\nAdd it to your daily schedule\n" +
                  "Tick it off\n" +
                  "Plan for changes\n" +
                  "Give yourself time\n");
        case "state_profile":
          return $("What would you like to view?");
        case "state_profile_change_info":
          return $("What would you like to change?");
          case "state_new_name":
              return $("What name would you like me to call you instead?");
        case "state_processing_info_menu":
          return $("Choose a question:");
        case "state_share":
          return $("Do you want to receive an SMS that you can share with other men living with HIV?");
        case "state_confirm_share":
          return $("Thank you. You will receive an SMS with info that you can share with other men living with HIV.");
        case "state_resources":
          return $("Select a topic:");
        case "state_exit":
          return $("It was great talking to you. If you ever want to know more about MenConnect" +
                  " and how to use it, dial *134*406#.\n\nChat soon!\nMo\nMenConnect");
        case "state_what_is_hiv":
          return $("It's a virus that enters your body through blood / bodily fluids. \n" +
                    "It attacks your CD4 cells that protect your body against disease.");
        case "state_hiv_body":
          return $("What does HIV do to my body?. \n" +
                    "HIV enters your body & makes more. " +
                    "It attacks your soldiers so you can't fight off common infections.");
        case "state_cure":
          return $("Is there a cure?\nThere is currently no cure for HIV. But taking ARVs every day can keep you healthy.");
        case "state_viral_load":
          return $("What is viral load?\nViral load is the amount of virus in your blood. The higher your viral load, the sicker you may be.");
        case "state_low_viral_load":
          return $("What is low viral load?\nA low viral load is a result of taking treatment every day.\n" +
                  "Eventually your viral load will be so low that it's undetectable.");
        case "state_age_group":
          return $("What is your current age?\nSelect your age group:");
        case "state_status_known":
          return $("When were you first diagnosed positive?");
        case "state_exit_not_hiv":
          return $("MenConnect sends you messages to help with your treatment.\n" +
                  "It seems like you don't need treatment." +
                  "If you sent the wrong answer, dial *134*406# to restart.");
        case "state_treatment_started":
          return $("Are you or have you been on ARV treatment?");
        case "state_treatment_start_date":
          return $("When did you start taking ARV treatment?");
        case "state_still_on_treatment":
          return $("Are you still taking your treatment?");
        case "state_viral_detect":
          return $("Is your viral load undetectable?");
        case "state_generic_error":
          return $("Please try again. e.g. 1.");
        case "state_how_treatment_works":
          return $("Taking your meds daily stops HIV from making more in your blood " +
                "so that your CD4 cells can get strong again.\n");
        case "state_short_error":
          return $("error");
        case "state_treatment_frequency":
          return $("Take your meds every day, at the same time " +
                "as prescribed by your nurse\n");
        case "state_treatment_duration":
          return $("You need to take your meds every day for the " +
                  "rest of your life to stay healthy.\n");
        case "state_treatment_side_effect":
          return $("Every person feels different after taking meds." +
                  "If it's making you unwell, speak to your nurse.\n");
        case "state_treatment_availability":
          return $("It is important that you take the meds that is prescribed " +
                  "to you by a nurse.\n");
        case "state_skip_a_day":
          return $("You can still take the meds within 6 hrs of usual time. " +
                  "Don't double your dose the next day if you missed a day.\n");
        case "state_menconnect_info":
          return $("We process your info to help you on your health journey. " +
                    "We collect name, age, cell number, language, channel, " +
                      "status, clinic dates, & survey answers.");
        case "state_menconnect_info_need":
          return $("We use your personal info to send you messages that are relevant " +
                    "to the stage of your health journey. " +
                      "Your info helps the team improve the service.");
        case "state_menconnect_info_visibility":
          return $("Your data is protected. It's processed by MTN, Cell C, Telkom, Vodacom, " +
                    "Praekelt, Genesis, Jembi, Turn, WhatsApp & MenStar partners");
        case "state_menconnect_info_duration":
          return $("We hold your info while you're registered. " +
                    "If you opt-out, we'll use your info for historical ," +
                      "research & statistical reasons with your consent.");
      }
    };

    self.states.add("state_registered", function(name) {
      return new MenuState(name, {
        question: $(
          "What would you like to view?"
        ),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_hiv", $("HIV")),
          new Choice("state_treatment", $("Treatment")),
          new Choice("state_reminders", $("Reminders")),
          new Choice("state_habit_plan", $("Habit Plan")),
          new Choice("state_profile", $("My Profile")),
          new Choice("state_processing_info_menu", $("Processing my info")),
          new Choice("state_share", $("Share")),
          new Choice("state_resources", $("Resources")),
          new Choice("state_exit", $("Exit"))
        ]
      });
    });

    self.add('state_hiv', function(name){
      return new MenuState(name, {
        question: get_content(name).context(),
        error: get_content("state_generic_error").context(),
        choices: [
          new Choice("state_what_is_hiv", $("What is HIV?")),
          new Choice("state_hiv_body", $("What does HIV do to my body?")),
          new Choice("state_cure", $("Is there a cure?")),
          new Choice("state_viral_load", $("What is viral load?")),
          new Choice("state_low_viral_load", $("What is low viral load?")),
          new Choice("state_registered", $("Back"))
        ]
      });
    });

    self.add('state_what_is_hiv', function(name){
      return new MenuState(name, {
        question: get_content(name).context(),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_hiv", $("Back"))
        ]
      });
    });

    self.add('state_hiv_body', function(name){
      return new MenuState(name, {
        question:get_content(name).context(),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_hiv", $("Back"))
        ]
      });
    });

    self.add('state_cure', function(name){
      return new MenuState(name, {
        question:get_content(name).context(),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_hiv", $("Back to HIV questions"))
        ]
      });
    });

    self.add('state_viral_load', function(name){
      return new MenuState(name, {
        question:get_content(name).context(),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_hiv", $("Back to HIV questions"))
        ]
      });
    });

    self.add('state_low_viral_load', function(name){
      return new MenuState(name, {
        question:get_content(name).context(),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_hiv", $("Back to HIV questions"))
        ]
      });
    });

    self.add('state_treatment', function(name){
      return new MenuState(name, {
        question: get_content(name).context(),
        error: get_content("state_short_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_how_treatment_works", $("How it works?")),
          new Choice("state_treatment_frequency", $("When to take it?")),
          new Choice("state_treatment_duration", $("How long to take it?")),
          new Choice("state_treatment_side_effect", $("Side effects?")),
          new Choice("state_treatment_availability", $("How do I get it?")),
          new Choice("state_skip_a_day", $("Can I skip a day?")),
          new Choice("state_registered", $("Back"))
        ]
      });
    });

    self.add('state_how_treatment_works', function(name){
      return new MenuState(name, {
        question: get_content(name).context(),
        error: get_content("state_short_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_treatment", $("Back"))
        ]
      });
    });

    self.add('state_treatment_frequency', function(name){
      return new MenuState(name, {
        question: get_content(name).context(),
        error: get_content("state_short_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_treatment", $("Back"))
        ]
      });
    });

    self.add('state_treatment_duration', function(name){
      return new MenuState(name, {
        question: get_content(name).context(),
        error: get_content("state_short_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_treatment", $("Back"))
        ]
      });
    });

    self.add('state_treatment_side_effect', function(name){
      return new MenuState(name, {
        question: get_content(name).context(),
        error: get_content("state_short_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_treatment", $("Back"))
        ]
      });
    });

    self.add('state_treatment_availability', function(name){
      return new MenuState(name, {
        question: get_content(name).context(),
        error: get_content("state_short_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_treatment", $("Back"))
        ]
      });
    });

    self.add('state_skip_a_day', function(name){
      return new MenuState(name, {
        question: get_content(name).context(),
        error: get_content("state_short_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_treatment", $("Back"))
        ]
      });
    });

    self.add('state_reminders', function(name){
      return new MenuState(name, {
        question: get_content(name).context(),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_show_clinic_date", $("Show my next expected clinic date")),
          new Choice("state_new_clinic_date", $("Change my next clinic date")),
          new Choice("state_plan_clinic_visit", $("Plan for my clinic visit")),
          new Choice("state_registered", $("Back to menu"))
        ]
      });
    });

    self.add('state_show_clinic_date', function(name){
      var contact = self.im.user.answers.contact;
      var text = $([
        "Based on what you told me, I think your next clinic visit is {{next_clinic_visit}}"
      ].join("\n")).context({
        next_clinic_visit:
            _.get(contact, "fields.next_clinic_visit", $("None")),
      });
      return new MenuState(name, {
        question: text,
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_new_clinic_date", $("Change your next clinic date")),
          new Choice("state_registered", $("Back to menu")),
          new Choice("state_exit", $("Exit"))
        ]
      });
    });

    self.add('state_new_clinic_date', function(name){
      return new FreeText(name, {
        question: get_content(name).context(),
        check: function(content) {
          var givendate = new Date(content);
          var today = new Date();
          today.setHours(0,0,0,0);
          //Set a timestamp 400 days forward. We want to reject clinic dates that are more than 400 days from today
          var timestamp = new Date().getTime() + (400 * 24 * 60 * 60 * 1000);
          var match = content.match(/([12]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))/);
          if(!match){
            return $(
              "Sorry, I don’t recognise that date. Please try again.");
          }
          if (givendate > timestamp) {
              return $("Hmm, that seems a bit far away. " +
              "You should at least be going to the clinic every 2 months. Please try again.");
          } if (givendate < today) {
            return $(
              "Oops, that day has already passed. Please try again."
            );
          }
        },
        next: "state_clinic_date_display"
      });
    });

    self.add('state_exit', function(name){
      return new EndState(name, {
        next: "state_start",
        text: get_content(name).context(),
      });
    });

    self.add("state_clinic_date_display", function(name){
      var clinic_date = self.im.user.answers.state_new_clinic_date;
      return new MenuState(name, {
        question: $("You entered {{clinic_date}}. " +
                  "I'll send you reminders of your upcoming clinic visits " +
                  "so that you don't forget.").context({clinic_date: clinic_date}),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_change_clinic_date", $("Confirm")),
          new Choice("state_reminders", $("Back"))
        ]
      });
    });

    self.add("state_change_clinic_date", function(name, opts) {
        var msisdn = utils.normalize_msisdn(self.im.user.addr, "ZA");
        var answers = self.im.user.answers;
        var clinic_date = answers.state_new_clinic_date;
        return self.rapidpro
          .start_flow(
            self.im.config.change_next_clinic_visit_flow_id, null,
            "whatsapp:" + _.trim(msisdn, "+"), {
            clinic_date: clinic_date
            })
          .then(function() {
            return self.states.create("state_change_clinic_date_success");
          }).catch(function(e) {
            // Go to error state after 3 failed HTTP request
            opts.http_error_count = _.get(opts, "http_error_count", 0) + 1;
            if(opts.http_error_count === 3) {
              self.im.log.error(e.message);
              return self.states.create("__error__", {return_state: name});
            }
            return self.states.create(name, opts);
          });
    });

    self.add("state_change_clinic_date_success", function(name) {
      var answers = self.im.user.answers;
      var clinic_date = answers.state_new_clinic_date;
      return new MenuState(name, {
        question: $("Your next clinic visit has been " +
        "changed to {{clinic_date}}").context({clinic_date: clinic_date}),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_reminders", $("Back")),
          new Choice("state_exit", $("Exit"))
        ]
      });
    });

    self.add('state_plan_clinic_visit', function(name){
      return new MenuState(name, {
        question: $("Tip 1: Set a reminder in your phone" +
          "\nTip2: Tell someone you're going" +
            "\nTip 3: Plan your trip" +
              "\nTip 4: Prepare questions for your nurse"),
        error: $(
          "TBC"
        ),
        accept_labels: true,
        choices: [
          new Choice("state_registered", $("Back to menu"))
        ]
      });
    });

    self.add('state_habit_plan', function(name){
      return new MenuState(name, {
        question: get_content(name).context(),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_registered", $("Back"))
        ]
      });
    });

    self.add('state_profile', function(name){
      return new MenuState(name, {
        question: get_content(name).context(),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_profile_view_info", $("See my info")),
          new Choice("state_profile_change_info", $("Change my info")),
          new Choice("state_opt_out", $("Opt-out")),
          new Choice("state_registered", $("Back to menu"))
        ]
      });
    });

    self.add('state_profile_view_info', function(name){
      var contact = self.im.user.answers.contact;
      var text = $([
        "Name: {{name}}",
        "Cell number: {{msisdn}}",
        "Channel: {{channel}}",
        "Age: {{age_group}}",
        "Estimated treatment start date: {{treatment_start_period}}"
      ].join("\n")).context({
        name: _.get(contact, "name") || $('None'),
        msisdn: utils.readable_msisdn(self.im.user.addr, "27"),
        channel: _.get(contact, "fields.preferred_channel") || $('None'),
        age_group: _.get(contact, "fields.age_group") || $("None"),
        treatment_start_period: _.get(contact, "fields.treatment_start_period") || $("None")
      });

      return new MenuState(name, {
        question:text,
        choices: [
          new Choice("state_profile_change_info", $("Change info")),
          new Choice("state_profile", $("Back"))
        ]
      });
    });

    self.add('state_profile_change_info', function(name){
      var contact = self.im.user.answers.contact;
      return new MenuState(name, {
        question: get_content(name).context(),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_new_name", $("Name")),
          new Choice("state_target_msisdn", $("Cell number")),
          new Choice("state_new_age", $("Age")),
          new Choice("state_channel_switch_confirm",
          $("Change from {{current_channel}} to {{alternative_channel}}").context({
            current_channel: self.contact_current_channel(contact),
            alternative_channel: self.contact_alternative_channel(contact),
          })),
          new Choice("state_new_treatment_start_date", $("Treatment start date")),
          new Choice ("state_profile", $("Back"))
        ]
      });
    });

    self.add("state_new_name", function(name){
      return new FreeText(name, {
        question:get_content(name).context(),
        next: function(content) {
          return "state_new_name_display";
        }
      });
    });

    self.add("state_new_name_display", function(name) {
      var new_name = self.im.user.answers.state_new_name;
      return new MenuState(name, {
        question: $("You entered {{name}}").context({name: new_name}),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_change_name", $("confirm")),
          new Choice("state_profile_change_info", $("Back"))
        ]
      });
    });

    self.add("state_change_name", function(name, opts) {
      var msisdn = utils.normalize_msisdn(self.im.user.addr, "ZA");
      var answers = self.im.user.answers;
      var new_name = answers.state_new_name;
      return self.rapidpro
        .start_flow(
          self.im.config.change_name_flow_id, null,
          "whatsapp:" + _.trim(msisdn, "+"), {
            new_name: new_name
          }
        ).then(function() {
          return self.states.create("state_change_name_success");
        }).catch(function(e) {
          // Go to error state after 3 failed HTTP request
          opts.http_error_count = _.get(opts, "http_error_count", 0) + 1;
          if(opts.http_error_count === 3) {
            self.im.log.error(e.message);
            return self.states.create("__error__", {return_state: name});
          }
          return self.states.create(name, opts);
        });
    });

    self.add("state_change_name_success", function(name) {
      var answers = self.im.user.answers;
      var new_name = answers.state_new_name;
      return new MenuState(name, {
        question: $("Thanks. I'll call you {{name}}" +
        "\n\nWhat would you like to do next?").context({name:new_name}),

        accept_labels: true,
        choices: [
          new Choice("state_registered", $("Back to main menu")),
          new Choice("state_exit", $("Exit"))
        ]
      });
    });

    self.add("state_channel_switch_confirm", function(name) {
      var contact = self.im.user.answers.contact;
      return new MenuState(name, {
        question: $("Are you sure you want to get your MenConnect messages on " +
        "{{alternative_channel}}?"
        ).context({
          alternative_channel: self.contact_alternative_channel(contact)
        }),
        choices: [
          new Choice("state_channel_switch", $("Yes")),
          new Choice("state_no_channel_switch", $("No")),
        ],
        error: $("Sorry we don't recognise that reply. Please enter the number next to " +
        "your answer.")
      });
    });

    self.add("state_no_channel_switch", function(name) {
      var contact = self.im.user.answers.contact;
      return new MenuState(name, {
        question: $(
        "You'll keep getting your messages on {{channel}}. If you change your mind, " +
        "dial *134*406#. What would you like to do?"
        ).context({channel: self.contact_current_channel(contact)}),
        choices: [
          new Choice("state_start", $("Back to main menu")),
          new Choice("state_exit", $("Exit"))
        ],
        error: get_content("state_generic_error").context(),
      });
    });

    self.add("state_channel_switch", function(name, opts) {
      var contact = self.im.user.answers.contact, flow_uuid;
      if(_.toUpper(_.get(contact, "fields.preferred_channel")) === "WHATSAPP") {
        flow_uuid = self.im.config.sms_switch_flow_id;
      } else {
        flow_uuid = self.im.config.whatsapp_switch_flow_id;
      }
      var msisdn = utils.normalize_msisdn(self.im.user.addr, "ZA");

      return self.rapidpro
          .start_flow(flow_uuid, null, "whatsapp:" + _.trim(msisdn, "+"))
          .then(function() {
              return self.states.create("state_channel_switch_success");
          }).catch(function(e) {
              // Go to error state after 3 failed HTTP requests
              opts.http_error_count = _.get(opts, "http_error_count", 0) + 1;
              if(opts.http_error_count === 3) {
                self.im.log.error(e.message);
                return self.states.create("__error__", {return_state: name});
              }
              return self.states.create(name, opts);
          });
    });

    self.add("state_channel_switch_success", function(name) {
      var contact = self.im.user.answers.contact;
      return new MenuState(name, {
        question: $(
          "Okay. I'll send you MenConnect messages on {{channel}}." +
           "To move back to WhatsApp, reply *WA* or dial *134*406#."
        ).context({
            channel: self.contact_alternative_channel(contact)
        }),
        choices: [
          new Choice("state_profile", $("Back")),
          new Choice("state_exit", $("Exit"))
        ],
        error: $(
            "Sorry we don't recognise that reply. Please enter the number next to your " +
            "answer."
        )
      });
    });

    self.add('state_display_name', function(name){
      var preferred_name = self.im.user.answers.state_new_name;
      return new MenuState(name, {
        question: $("Thanks, I'll call you {{preferred_name}}" +
                    "\n\nWhat do you want to do next?").context({preferred_name: preferred_name}),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_registered", $("Back to menu")),
          new Choice("state_start", $("Exit")),
        ]
      });
    });

    self.add('state_target_msisdn', function(name){
      return new FreeText(name, {
        question: $("Please reply with the *new cell number* you would like to get " +
                    "your MenConnect messages on, e.g 0813547654"),
        check: function(content) {
          if(!utils.is_valid_msisdn(content, "ZA")){
            return (
                "Sorry that is not a real cellphone number. " +
                  "Please reply with the 10 digit number that you'd like " +
                    "to get your MenConnect messages on."
            );
          }
          if(utils.normalize_msisdn(content, "ZA") === "+27813547654") {
            return (
              "We're looking for your information. Please avoid entering " +
              "the examples in the messages. Enter your details."
            );
          }
          //We need to do a rapidpro contact check here
        },
        next: "state_msisdn_change_get_contact"
      });
    });

    self.add("state_msisdn_change_get_contact", function(name, opts) {
      // Fetches the contact from RapidPro, and delegates to the correct state
      var msisdn = utils.normalize_msisdn(
        _.get(self.im.user.answers, "state_target_msisdn"), "ZA"
      );

      return self.rapidpro.get_contact({urn: "whatsapp:" + _.trim(msisdn, "+")})
        .then(function(contact) {
          var consent = _.toUpper(_.get(contact, "fields.consent")) === "TRUE";
          if(consent) {
            return self.states.create("state_active_subscription");
          } else {
            return self.states.create("state_display_number");
          }
        }).catch(function(e) {
          // Go to error state after 3 failed HTTP requests
          opts.http_error_count = _.get(opts, "http_error_count", 0) + 1;
          if(opts.http_error_count === 3) {
            self.im.log.error(e.message);
            return self.states.create("__error__", {return_state: name});
          }
          return self.states.create(name, opts);
        });
    });

    self.add("state_active_subscription", function(name) {
      return new MenuState(name, {
        question: $(
          "Sorry, the cell number you entered already gets MC msgs. To manage it, " +
                    "dial *134*406# from that number. What would you like to do?"
        ),
        choices:[
          new Choice("state_start", $("Back")),
          new Choice("state_exit", $("Exit"))
        ],
        error: $(
          "Sorry we don't recognise that reply. Please enter the number next to your " +
          "answer."
        )
      });
    });

    self.add('state_display_number', function(name){
      var msisdn = self.im.user.answers.state_target_msisdn;
      return new MenuState(name, {
        question: $("You have entered {{msisdn}}" +
                    "as your new MenConnect number." +
                    "\n\nIs this correct?").context({msisdn: msisdn}),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_change_msisdn", $("Yes")),
          new Choice("state_target_msisdn", $("No, try again")),
        ]
      });
    });

    self.add("state_change_msisdn", function(name, opts) {
      var new_msisdn = utils.normalize_msisdn(
        self.im.user.answers.state_target_msisdn, "ZA"
      );
      return self.rapidpro
        .start_flow(
          self.im.config.msisdn_change_flow_id, null, "whatsapp:" + _.trim(new_msisdn, "+"), {
            new_msisdn: new_msisdn,
            old_msisdn: utils.normalize_msisdn(self.im.user.addr, "ZA"),
            contact_uuid: self.im.user.answers.contact.uuid,
            source: "POPI USSD"
          }
        )
        .then(function() {
          return self.states.create("state_change_msisdn_success");
      }).catch(function(e) {
          // Go to error state after 3 failed HTTP requests
          opts.http_error_count = _.get(opts, "http_error_count", 0) + 1;
          if(opts.http_error_count === 3) {
              self.im.log.error(e.message);
              return self.states.create("__error__", {return_state: name});
          }
          return self.states.create(name, opts);
      });
    });

    self.add("state_change_msisdn_success", function(name) {
      var new_msisdn = utils.readable_msisdn(
          _.defaultTo(self.im.user.answers.state_target_msisdn, self.im.user.addr), "27"
      );
      return new MenuState(name, {
          question: $(
              "Thanks! We sent a msg to {{msisdn}}. Follow the instructions. " +
              "\nWhat would you like to do?"
          ).context({msisdn: new_msisdn}),
          error: $(
              "Sorry we don't recognise that reply. Please enter the number next to your " +
              "answer."
          ),
          choices: [
              new Choice("state_start", $("Back")),
              new Choice("state_exit", $("Exit"))
          ]
      });
  });

    self.add('state_new_age', function(name){
      return new ChoiceState(name, {
        question: $("How old are you?" +
          "\nSelect your age group:"),
        error: $(
          "Sorry, please reply with the number that matches your answer, e.g. 1."
        ),
        accept_labels: true,
        choices: [
          new Choice("<15", $("<15")),
          new Choice("15-19", $("15-19")),
          new Choice("20-24", $("20-24")),
          new Choice("25-29", $("25-29")),
          new Choice("30-34", $("30-34")),
          new Choice("35-39", $("35-39")),
          new Choice("40-44", $("40-44")),
          new Choice("45-49", $("45-49")),
          new Choice("50+", $("50+"))
        ],
        next: 'state_age_display'
      });
    });

    self.add("state_age_display", function(name){
      var age = self.im.user.answers.state_new_age;
      return new MenuState(name, {
        question: $("Your age group will be updated to {{age}}").context({age: age}),
        error: $("Please select 1 or 2"),
        accept_labels: true,
        choices: [
          new Choice("state_change_age", $("confirm")),
          new Choice("state_profile_change_info", $("Back"))
        ]
      });
    });

    self.add("state_change_age", function(name, opts){
      var msisdn = utils.normalize_msisdn(self.im.user.addr, "ZA");
      var answers = self.im.user.answers;
      var age_group = answers.state_new_age;

      return self.rapidpro
        .start_flow(
          self.im.config.change_age_group_flow_id, null,
          "whatsapp:" + _.trim(msisdn, "+"), {
            age_group: age_group
          }
        ).then(function() {
          return self.states.create("state_change_age_success");
        }).catch(function(e) {
          // Go to error state after 3 failed HTTP request
          opts.http_error_count = _.get(opts, "http_error_count", 0) + 1;
          if(opts.http_error_count === 3) {
            self.im.log.error(e.message);
            return self.states.create("__error__", {return_state: name});
          }
          return self.states.create(name, opts);
        });
    });

    self.add("state_change_age_success", function(name) {
      var answers = self.im.user.answers;
      var age_group = answers.state_new_age;
      return new MenuState(name, {
        question: $("Thank you. Your age has been " +
        "changed to {{age_group}}\n").context({age_group: age_group}),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_registered", $("Back to main menu")),
          new Choice("state_exit", $("Exit"))
        ]
      });
    });

    self.add("state_new_treatment_start_date", function(name) {
      return new ChoiceState(name, {
        question:$("When did you start taking ARV treatment? " +
        "Choose the closest option.\n"),
        error: $(
          "Please reply with number closest to when you started treatment:"
        ),
        accept_labels: true,
        choices: [
          new Choice("today", $("today")),
          new Choice("<1 week", $("<1 week")),
          new Choice("<1 month", $("<1 month")),
          new Choice("<3 months", $("<3 months")),
          new Choice("3-6 months", $("3-6 months")),
          new Choice("6-12 months", $("6-12 months")),
          new Choice(">1 year", $(">1 year"))
        ],
        next: "state_new_treatment_date_display"
      });
    });

    self.add("state_new_treatment_date_display", function(name) {
      var treatment_start_date = self.im.user.answers.state_new_treatment_start_date;
      return new MenuState(name, {
        question: $("Your new treatment start date will be updated to " +
        "{{treatment_start_date}}").context({treatment_start_date: treatment_start_date}),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_change_treatment_start_date", $("Confirm")),
          new Choice("state_profile_change_info", $("Back"))
        ]
      });
    });

    self.add("state_change_treatment_start_date", function(name, opts) {
      var msisdn = utils.normalize_msisdn(self.im.user.addr, "ZA");
      var answers = self.im.user.answers;
      var treatment_start_period = answers.state_new_treatment_start_date;
      return self.rapidpro
        .start_flow(
          self.im.config.change_treatment_start_date_flow_id, null,
          "whatsapp:" + _.trim(msisdn, "+"), {
            treatment_start_period: treatment_start_period
          }
        ).then(function() {
          return self.states.create("state_change_treatment_start_date_success");
        }).catch(function(e) {
          // Go to error state after 3 failed HTTP request
          opts.http_error_count = _.get(opts, "http_error_count", 0) + 1;
          if(opts.http_error_count === 3) {
            self.im.log.error(e.message);
            return self.states.create("__error__", {return_state: name});
          }
          return self.states.create(name, opts);
        });
    });

    self.add("state_change_treatment_start_date_success", function(name) {
      var answers = self.im.user.answers;
      var treatment_start_period = answers.state_new_treatment_start_date;
      return new MenuState(name, {
        question: $("Thank you. Your treatment start date has " +
        "been changed to {{treatment_start_period}}").context({treatment_start_period: treatment_start_period}),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_registered", $("Back to main menu")),
          new Choice("state_exit", $("Exit"))
        ]
      });
    });

    self.add('state_processing_info_menu', function(name){
      return new MenuState(name, {
        question: get_content(name).context(),
        accept_labels: true,
        choices: [
          new Choice("state_menconnect_info", $("What info does MenConnect collect?")),
          new Choice("state_menconnect_info_need", $("Why does MenConnect need my info?")),
          new Choice("state_menconnect_info_visibility", $("Who can see my info?")),
          new Choice("state_menconnect_info_duration", $("How long is my info kept?"))
        ]
      });
    });

    self.add('state_menconnect_info', function(name){
      return new MenuState(name, {
        question:get_content(name).context(),
        error: get_content("state_generic_error").context(),
        choices: [
          new Choice("state_processing_info_menu", $("Back"))
        ]
      });
    });

    self.add('state_menconnect_info_need', function(name){
      return new MenuState(name, {
        question:get_content(name).context(),
        error: get_content("state_generic_error").context(),
        choices: [
          new Choice("state_processing_info_menu", $("Back"))
        ]
      });
    });

    self.add('state_menconnect_info_visibility', function(name){
      return new MenuState(name, {
        question:get_content(name).context(),
        error: get_content("state_generic_error").context(),
        choices: [
          new Choice("state_processing_info_menu", $("Back"))
        ]
      });
    });

    self.add('state_menconnect_info_duration', function(name){
      return new MenuState(name, {
        question:get_content(name).context(),
        error: get_content("state_generic_error").context(),
        choices: [
          new Choice("state_processing_info_menu", $("Back"))
        ]
      });
    });

    self.add('state_share', function(name){
      return new MenuState(name, {
        question: get_content(name).context(),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_send_sms", $("Yes")),
          new Choice("state_registered", $("Back to menu"))
        ]
      });
    });

    self.add("state_send_sms", function(name, opts) {
      var msisdn = utils.normalize_msisdn(self.im.user.addr, "ZA");
      return self.rapidpro
        .start_flow(
          self.im.config.send_sms_flow_id, null,
          "whatsapp:" + _.trim(msisdn, "+")).then(function() {
            return self.states.create("state_confirm_share");
          }).catch(function(e) {
            // Go to error state after 3 failed HTTP request
            opts.http_error_count = _.get(opts, "http_error_count", 0) + 1;
            if(opts.http_error_count === 3) {
              self.im.log.error(e.message);
              return self.states.create("__error__", {return_state: name});
            }
            return self.states.create(name, opts);
          });
    });

    self.add("state_confirm_share", function(name){
      return new MenuState(name, {
        question: get_content(name).context(),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_send_sms", $("Back to Menu"))
        ]
      });
    });

    self.add('state_resources', function(name){
      return new MenuState(name, {
        question: get_content(name).context(),
        accept_labels: true,
        choices: [
          new Choice("state_depression", $("Depression")),
          new Choice("state_mental_health", $("Mental health")),
          new Choice("state_suicide", $("Suicide")),
          new Choice("state_gender_violence", $("Gender based violence")),
          new Choice("state_substance_abuse", $("Substance abuse")),
          new Choice("state_aids_helpline", $("Aids helpline")),
          new Choice("state_covid19", $("COVID-19")),
          new Choice("state_registered", $("Back to menu"))
        ]
      });
    });

    self.add('state_depression', function(name){
      return new MenuState(name, {
        question: $("Adcock Ingram Depression and Anxiety Helpline can help you " +
          "if you are feeling depressed. Call 0800 7080 90"),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_resources", $("Back to resources"))
        ]
      });
    });

    self.add('state_mental_health', function(name){
      return new MenuState(name, {
        question: $("The South African Depression and Anxiety group can support you when " +
          "you're feeling low. Dial 0800 4567 789 for their 24 hour helpline."),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_resources", $("Back to resources"))
        ]
      });
    });

    self.add('state_suicide', function(name){
      return new MenuState(name, {
        question: $("The South African Depression and Anxiety group can support you when" +
          "you're feeling low. Dial 0800 4567 789 for their emergency suicide helpline."),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_resources", $("Back to resources"))
        ]
      });
    });

    self.add('state_gender_violence', function(name){
      return new MenuState(name, {
        question: $("Anonymous & confidential info, counselling and referrals to survivors," +
          "witnesses and perpetrators of gender-based violence. Dial 0800 150 150."),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_resources", $("Back to resources"))
        ]
      });
    });

    self.add('state_substance_abuse', function(name){
      return new MenuState(name, {
        question: $("The Substance Abuse Line offers support & guidance for people addicted to " +
                      "drugs and alcohol as well as their families. Dial 0800 12 13 14 or SMS 32312"),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_resources", $("Back to resources"))
        ]
      });
    });

    self.add('state_aids_helpline', function(name){
      return new MenuState(name, {
        question: $("The National HIV and AIDs Helpline is a toll free number that you can call " +
                      "for anonymous and confidential advice. Call 0800 012 322 for 24 hour help."),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_resources", $("Back to resources"))
        ]
      });
    });

    self.add('state_covid19', function(name){
      return new MenuState(name, {
        question: $("For correct & up to date info on COVID-19, save the number +2760 0123 456 " +
                      "and send 'hi' or call the national COVID-19 hotline on 0800 029 999."),
        error: get_content("state_generic_error").context(),
        accept_labels: true,
        choices: [
          new Choice("state_resources", $("Back to resources"))
        ]
      });
    });

    //New registration starts here
    self.add('state_exit_no_consent', function(name){
      return new EndState(name, {
        next: "state_start",
        text: "No problem!" +
          "If you change your mind and want to receive supportive messages in the future, dial *134*406# and I'll sign you up."
      });
    });

    //We only need message consent
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
        return self.states.create("state_age_group");
      }
      return new MenuState(name, {
        question: $(
          "MenConnect supports men on their journey. I'll send you messages with info & tips." +
            "Do you agree to receive?"
        ),
        error: $(
          "Please try again. Reply with the number that matches your answer, e.g. 1." +
            "\n\nDo you agree to receive messages?"
        ),
        accept_labels: true,
        choices: [
          new Choice("state_age_group", $("Yes")),
          new Choice("state_message_consent_denied", $("No"))
        ]
      });
    });

    self.add("state_message_consent_denied", function(name) {
      return new EndState(name, {
        next: "state_start",
        text: $ ("No problem! " +
          "If you change your mind and want to receive supportive messages in the future," +
            " dial *134*406# and I'll sign you up."
        ),
      });
    });

    self.add('state_age_group', function(name){
      return new ChoiceState(name, {
        question:get_content(name).context(),
        error: $(
          "Please reply with the number that matches your answer." +
            "\n\nSelect your age group:",
            "1. <15",
            "2. 15-19",
            "3. 20-24",
            "4. 25-29",
            "5. 30-34",
            "6. 35-39",
            "7. 40-44",
            "8. 45-49",
            "9. 50+"
        ),
        accept_labels: true,
        choices: [
          new Choice("<15", $("<15")),
          new Choice("15-19", $("15-19")),
          new Choice("20-24", $("20-24")),
          new Choice("25-29", $("25-29")),
          new Choice("30-34", $("30-34")),
          new Choice("35-39", $("35-39")),
          new Choice("40-44", $("40-44")),
          new Choice("45-49", $("45-49")),
          new Choice("50+", $("50+"))
        ],
        next: 'state_status_known'
      });
    });

    self.add('state_status_known', function(name){
      return new ChoiceState(name, {
        question:get_content(name).context(),
        error: $("Please reply with the number that matches your answer, eg .1."),

        accept_labels: true,
        choices: [
          new Choice("today", $("Today")),
          new Choice("<1 week", $("Last week")),
          new Choice("<1 month", $("<1 month")),
          new Choice("<3 months", $("<3 months")),
          new Choice("3-6 months", $("3-6 months")),
          new Choice("6-12 months", $("6-12 months")),
          new Choice(">1 year", $("> 1 year")),
          new Choice("not positive", $("not positive")),
          new Choice("idk", $("not sure"))
        ],
        back: $("Back"),
        more: $("Next"),
        options_per_page: null,
        characters_per_page: 160,
        next: function(choice) {
          if (choice.value === "not positive" || choice.value === "idk") {
            return "state_exit_not_hiv";
          } else {
            return "state_treatment_started";
          }
        }

      });
    });

    self.states.add("state_exit_not_hiv", function(name) {
      return new EndState(name, {
        next: "state_start",
        text: get_content(name).context("It seems like you don't need treatment. " +
          "If you sent the wrong answer, dial *134*406# to restart."),
      });
    });

    self.states.add("state_exit_thanks", function(name) {
      return new EndState(name, {
        next: "state_start",
        text: $(
          "Thank you for considering MenConnect. We respect your decision. Have a lovely day."
        )
      });
    });

    self.states.add("state_generic_error", function(name) {
      return new EndState(name, {
        text: get_content(name).context(),
      });
    });

    self.states.add("state_short_error", function(name) {
      return new EndState(name, {
        text: get_content(name).context(),
      });
    });

    self.add('state_treatment_started', function(name){
      return new ChoiceState(name, {
        question:get_content(name).context(),
        error: $(
          "Please try again. Reply with the number that matches your answer, e.g. 1.\n" +
            "Are you or have you been on ARV treatment?"
        ),
        accept_labels: true,
        choices: [
          new Choice("Yes", $("Yes")),
          new Choice("No", $("No"))
        ],
        next: function(content) {
          if (content.value == "Yes") {
            return "state_treatment_start_date";
          }
          else {
            return "state_viral_detect";
          }
        }
      });
    });

    self.add('state_treatment_start_date', function(name){
      return new ChoiceState(name, {
        question:get_content(name).context(),
        error: $(
          "Please reply with number closest to when you started treatment: "
        ),
        accept_labels: true,
        choices: [
          new Choice("today", $("today")),
          new Choice("<1 week", $("<1 week")),
          new Choice("<1 month", $("<1 month")),
          new Choice("<3 months", $("<3 months")),
          new Choice("3-6 months", $("3-6 months")),
          new Choice("6-12 months", $("6-12 months")),
          new Choice(">1 year", $(">1 year"))
        ],
        next: 'state_still_on_treatment'
      });
    });

    self.add('state_still_on_treatment', function(name){
      return new ChoiceState(name, {
        question:get_content(name).context(),
        error: $(
          "Please try again. Reply with the number that matches your answer, e.g. 1."
        ),
        accept_labels: true,
        choices: [
          new Choice("Yes", $("Yes")),
          new Choice("No", $("No")),
          new Choice("Mostly", $("Mostly - sometimes I forget"))
        ],
        next: 'state_viral_detect'
      });
    });

    self.add('state_viral_detect', function(name){
      return new ChoiceState(name, {
        question:get_content(name).context(),
        error: $(
          "Please try again. Reply with the number that matches your answer, e.g. 1." +
            "\nIs your viral load undetectable?"
        ),
        accept_labels: true,
        choices: [
          new Choice("Yes", $("Yes")),
          new Choice("No", $("No")),
          new Choice("Unsure", $("I don't know"))
        ],
        next: 'state_name_mo'
      });
    });

    self.add('state_name_mo', function(name){
      return new FreeText(name, {
        question:get_content(name).context(),
        next: 'state_whatsapp_contact_check'
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
        var data = {
        on_whatsapp: self.im.user.get_answer("on_whatsapp") ? "true" : "false",
        consent: self.im.user.get_answer("state_message_consent") === "yes" ? "true" : "false",
        language: "en",
        source: "USSD registration",
        timestamp: new moment.utc(self.im.config.testing_today).format(),
        registered_by: utils.normalize_msisdn(self.im.user.addr, "ZA"),
        mha: 6,
        swt: self.im.user.get_answer("on_whatsapp") ? 7 : 1,
        age_group: self.im.user.get_answer("state_age_group"),
        status_known_period: self.im.user.get_answer("state_status_known"),
        treatment_adherent: self.im.user.get_answer("state_still_on_treatment") || "No",
        treatment_initiated: self.im.user.get_answer("state_treatment_started"),
        treatment_start_period: self.im.user.get_answer("state_treatment_start_date"),
        viral_load_undetectable: self.im.user.get_answer("state_viral_detect"),
        name: self.im.user.get_answer("state_name_mo")
      };
      return self.rapidpro
        .start_flow(
          self.im.config.flow_uuid,
          null,
          "whatsapp:" + _.trim(msisdn, "+"), data)
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
      var channel = self.im.user.get_answer("on_whatsapp") ? "WhatsApp" : "SMS";
      return new EndState(name, {
        next: "state_start",
        text: $(
          "You're done! You will get info & tips on {{msisdn}} to support you on your journey on " +
          "{{channel}}. " +
          "Thanks for signing up to MenConnect!"
        ).context({ msisdn: msisdn, channel: channel })
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
