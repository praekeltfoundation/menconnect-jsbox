var vumigo = require("vumigo_v02");
var AppTester = vumigo.AppTester;
var assert = require("assert");
const { describe, it } = require("eslint/lib/rule-tester/rule-tester");
var fixtures_rapidpro = require("./fixtures_rapidpro")();
var fixtures_whatsapp = require("./fixtures_whatsapp")();

function daysFromNow(days) {
  var milliseconds = days * 24 * 3600 * 1000;
  var date = new Date(new Date().getTime() + milliseconds);
  return date.toISOString().replace(/T.*/, "");
}

describe("ussd_registration app", function() {
  var app;
  var tester;

  beforeEach(function() {
    app = new go.app.GoMenConnect();
    tester = new AppTester(app);
    tester.setup.config.app({
      testing_today: "2014-04-04T07:07:07",
      clinic_date_time: "2020-12-20T15:42:05.516708+2:00",
      metric_store: 'test_metric_store',
      env: 'test',
      services: {
        rapidpro: {
          base_url: "https://rapidpro",
          token: "rapidprotoken"
        },
        whatsapp: {
          base_url: "https://whatsapp.example.org",
          token: "api-token"
        }
      },
      registration_group_ids: ["id-1"],
      flow_uuid: "rapidpro-flow-uuid",
      msisdn_change_flow_id: "msisdn-change-flow-id",
      change_age_group_flow_id: "change-age_group-flow-id",
      change_name_flow_id: "change-name-flow-id",
      change_treatment_start_date_flow_id: "change-treatment-start-date-flow-id",
      sms_switch_flow_id: "sms-switch-flow-id",
      whatsapp_switch_flow_id: "whatsapp-switch-flow-id",
      change_next_clinic_visit_flow_id: "change-next-clinic-visit-flow-id",
      send_sms_flow_id: "send-sms-flow-id",
      optout_flow_id: "optout-flow-id",
      popi_consent: "12-2021",
      popi_consent_flow_uuid: "popi-consent-flow-uuid",
      popi_send_flow_uuid: "popi-send-flow-uuid"
    })
    .setup(function(api) {
      api.metrics.stores = {'test_metric_store': {}};
    });
  });

  describe("state_start", function() {
    it("should retry HTTP call when RapidPro is down", function() {
      return tester
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_rapidpro.get_contact({
              urn: "whatsapp:27123456789",
              failure: true
            })
          );
        })
        .start()
        .check.interaction({
          state: "__error__",
          reply:
            "Sorry, something went wrong. We have been notified. Please try again later"
        })
        .check(function(api) {
          var metrics = api.metrics.stores.test_metric_store;
          assert.deepEqual(metrics['enter.__error__'], {agg: 'sum', values: [1]});
          assert.equal(api.http.requests.length, 3);
          api.http.requests.forEach(function(request) {
            assert.equal(request.url, "https://rapidpro/api/v2/contacts.json");
          });
          assert.equal(api.log.error.length, 1);
          assert(api.log.error[0].includes("HttpResponseError"));
        })
        .run();
    });

    it("should go to already registered state", function() {
      return tester
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_rapidpro.get_contact({
              urn: "whatsapp:27123456789",
              exists: true,
              groups: ["other", "Registered"]
            })
          );
        })
        .check.user.state("state_registered")
        .check(function(api) {
          var metrics = api.metrics.stores.test_metric_store;
          assert.deepEqual(metrics['enter.state_registered'], {agg: 'sum', values: [1]});
        })
        .run();
    });

    it("should go to the information consent state if they are not registered yet", function() {
      return tester
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_rapidpro.get_contact({
              urn: "whatsapp:27123456789",
              exists: true,
            })
          );
        })
        .check.user.state("state_message_consent")
        .check(function(api) {
          var metrics = api.metrics.stores.test_metric_store;
          assert.deepEqual(metrics['test.test_app.sum.unique_users.transient'], {agg: 'sum', values: [1]});
          assert.deepEqual(metrics['enter.state_message_consent'], {agg: 'sum', values: [1]});
        })
        .run();
    });
  });
  describe("state_registered", function() {
    it("should show the main menu for registered users", function() {
      return tester.setup.user
        .state("state_registered")
        .check.interaction({
          reply: [
            "What would you like to view?",
            "1. HIV",
            "2. Treatment",
            "3. Reminders",
            "4. Habit Plan",
            "5. My Profile",
            "6. Processing my info",
            "7. Share",
            "8. Resources"
          ].join("\n")
        })
        .run();
    });
    it("should show the main Zulu menu for registered users", function() {
      return tester.setup.user
        .state("state_registered_zulu")
        .check.interaction({
          reply: [
            "Funda kabanzi nge?",
            "1. HIV",
            "2. Amaphilisi",
            "3. Izikhumbuzo",
            "4. Uhlelo Lwemikhuba",
            "5. Iphrofayela",
            "6. Ukucubungula ulwazi lwami",
            "7. Ukwabelana",
            "8. Izisetshenziswa"
          ].join("\n")
        })
        .run();
    });
    it("should show the main Sotho menu for registered users", function() {
      return tester.setup.user
        .state("state_registered_sotho")
        .check.interaction({
          reply: [
            "O lakatsa ho shebang?",
            "1. HIV",
            "2. Kalafo",
            "3. Dikgopotso",
            "4. Morero wa Tlwaelo",
            "5. Porofaele Ya Ka",
            "6. Ho lokisa lesedi la ka",
            "7. Ho arolelana",
            "8. Dirisose"
          ].join("\n")
        })
        .run();
    });
    it("should show an error for invalid choice", function() {
      return tester.setup.user
        .state("state_registered")
        .inputs("10")
        .check.interaction({
          state:"state_registered",
          reply: [
            "Please try again. e.g. 1.",
            "1. HIV",
            "2. Treatment",
            "3. Reminders",
            "4. Habit Plan",
            "5. My Profile",
            "6. Processing my info",
            "7. Share",
            "8. Resources"
          ].join("\n")
        })
        .run();
    });
    it("should show the hiv menu", function() {
      return tester.setup.user
        .state("state_registered")
        .inputs("1")
        .check.interaction({
          state:"state_hiv",
          reply: [
            "What's your question?",
            "1. What is HIV?",
            "2. What does HIV do to my body?",
            "3. Is there a cure?",
            "4. What is viral load?",
            "5. What is low viral load?",
            "6. Back"
          ].join("\n")
        })
        .check(function(api){
          var metrics = api.metrics.stores.test_metric_store;
          assert.deepEqual(metrics['enter.state_hiv'], {agg: 'sum', values: [1]});
        })
        .run();
    });
    it("should show the hiv Zulu menu", function() {
      return tester.setup.user
        .state("state_hiv_zulu")
        .check.interaction({
          reply: [
            "Uthini umbuzo wakho?",
            "1. Yini i-HIV?",
            "2. I-HIV yenzani emzimbeni wami?",
            "3. Likhona ikhambi?",
            "4. Yini i-viral load?",
            "5. Yini i-viral load ephansi?",
            "6. Emuva"
          ].join("\n")
        })
        .run();
    });
  });
  describe("state_hiv", function() {
    it("should show the main menu for registered users", function() {
      return tester.setup.user
        .state("state_hiv")
        .check.interaction({
          reply: [
            "What's your question?",
            "1. What is HIV?",
            "2. What does HIV do to my body?",
            "3. Is there a cure?",
            "4. What is viral load?",
            "5. What is low viral load?",
            "6. Back"
          ].join("\n")
        })
        .run();
    });
    it("should show an error for invalid choice", function() {
      return tester.setup.user
        .state("state_hiv")
        .inputs("10")
        .check.interaction({
          state:"state_hiv",
          reply: [
            "Please try again. e.g. 1.",
            "1. What is HIV?",
            "2. What does HIV do to my body?",
            "3. Is there a cure?",
            "4. What is viral load?",
            "5. What is low viral load?",
            "6. Back"
          ].join("\n")
        });
    });
    it("should show what HIV is", function() {
      return tester.setup.user
        .state("state_hiv")
        .inputs("1")
        .check.interaction({
          state:"state_what_is_hiv",
          reply: [
            "It's a virus that enters your body through blood / bodily fluids. ",
            "It attacks your CD4 cells that protect your body against disease.",
            "1. Back"
          ].join("\n")
        })
        .run();
    });
    it("should show what HIV does to my body", function() {
      return tester.setup.user
        .state("state_hiv")
        .inputs("2")
        .check.interaction({
          state:"state_hiv_body",
          reply: [
            "What does HIV do to my body?. \n" +
            "HIV enters your body & makes more. " +
            "It attacks your soldiers so you can't fight off common infections.",
            "1. Back"
          ].join("\n")
        })
        .check(function(api){
          var metrics = api.metrics.stores.test_metric_store;
          assert.deepEqual(metrics['enter.state_hiv_body'], {agg: 'sum', values: [1]});
        })
        .run();
    });
  });
  describe("state_what_is_hiv", function() {
    it("should show the main menu for registered users", function() {
      return tester.setup.user
        .state("state_what_is_hiv")
        .check.interaction({
          reply: [
            "It's a virus that enters your body through blood / bodily fluids. ",
            "It attacks your CD4 cells that protect your body against disease.",
            "1. Back"
          ].join("\n")
        })
        .run();
    });
    it("should show an error for invalid choice", function() {
      return tester.setup.user
        .state("state_what_is_hiv")
        .inputs("10")
        .check.interaction({
          state:"state_what_is_hiv",
          reply: [
            "Please try again. e.g. 1.",
            "1. Back"
          ].join("\n")
        })
        .run();
    });
    it("should go back to the HIV menu", function() {
      return tester.setup.user
        .state("state_what_is_hiv")
        .inputs("1")
        .check.interaction({
          state:"state_hiv",
          reply: [
            "What's your question?",
            "1. What is HIV?",
            "2. What does HIV do to my body?",
            "3. Is there a cure?",
            "4. What is viral load?",
            "5. What is low viral load?",
            "6. Back"
          ].join("\n")
        })
        .run();
    });
  });
  describe("state_treatment_menu", function() {
    it("should show the treatment menu for registered users", function() {
      return tester.setup.user
        .state("state_treatment")
        .check.interaction({
          reply: [
            "What do you want to know?",
            "1. How it works?",
            "2. When to take it?",
            "3. How long to take it?",
            "4. Side effects?",
            "5. How do I get it?",
            "6. Can I skip a day?",
            "7. Back"
          ].join("\n")
        })
        .run();
    });
    it("should show an error for invalid choice", function() {
      return tester.setup.user
        .state("state_treatment")
        .inputs("8")
        .check.interaction({
          state:"state_treatment",
          reply: [
            "error",
            "1. How it works?",
            "2. When to take it?",
            "3. How long to take it?",
            "4. Side effects?",
            "5. How do I get it?",
            "6. Can I skip a day?",
            "7. Back"
          ].join("\n")
        })
        .run();
    });
    it("should go to the how does it work screen", function() {
      return tester.setup.user
        .state("state_treatment")
        .inputs("1")
        .check.interaction({
          state:"state_how_treatment_works",
          reply: [
            "Taking your meds daily stops HIV from making more in your blood " +
            "so that your CD4 cells can get strong again.",
            "\n1. Back"
          ].join("\n")
        })
        .check(function(api){
          var metrics = api.metrics.stores.test_metric_store;
          assert.deepEqual(metrics['enter.state_how_treatment_works'], {agg: 'sum', values: [1]});
        })
        .run();
    });
    it("should go to the treatment frequency screen", function() {
      return tester.setup.user
        .state("state_treatment")
        .inputs("2")
        .check.interaction({
          state:"state_treatment_frequency",
          reply: [
            "Take your meds every day, at the same time " +
            "as prescribed by your nurse",
            "\n1. Back"
          ].join("\n")
        })
        .check(function(api){
          var metrics = api.metrics.stores.test_metric_store;
          assert.deepEqual(metrics['enter.state_treatment_frequency'], {agg: 'sum', values: [1]});
        })
        .run();
    });
  it("should go to the treatment duration screen", function() {
    return tester.setup.user
      .state("state_treatment")
      .inputs("3")
      .check.interaction({
        state:"state_treatment_duration",
        reply: [
          "You need to take your meds every day for the " +
          "rest of your life to stay healthy.",
          "\n1. Back"
        ].join("\n")
      })
      .check(function(api){
        var metrics = api.metrics.stores.test_metric_store;
        assert.deepEqual(metrics['enter.state_treatment_duration'], {agg: 'sum', values: [1]});
      })
      .run();
  });
  it("should go to treatment side-effects screen", function() {
    return tester.setup.user
      .state("state_treatment")
      .inputs("4")
      .check.interaction({
        state:"state_treatment_side_effect",
        reply: [
          "Every person feels different after taking meds." +
          "If it's making you unwell, speak to your nurse.",
          "\n1. Back"
        ].join("\n")
      })
      .check(function(api){
        var metrics = api.metrics.stores.test_metric_store;
        assert.deepEqual(metrics['enter.state_treatment_side_effect'], {agg: 'sum', values: [1]});
      })
      .run();
  });
  it("should go to treatment availability screen", function() {
    return tester.setup.user
      .state("state_treatment")
      .inputs("5")
      .check.interaction({
        state:"state_treatment_availability",
        reply: [
          "It is important that you take the meds that is prescribed " +
          "to you by a nurse.",
          "\n1. Back"
        ].join("\n")
      })
      .check(function(api){
        var metrics = api.metrics.stores.test_metric_store;
        assert.deepEqual(metrics['enter.state_treatment_availability'], {agg: 'sum', values: [1]});
      })
      .run();
  });
  it("should go to treatment skip a day screen", function() {
    return tester.setup.user
      .state("state_treatment")
      .inputs("6")
      .check.interaction({
        state:"state_skip_a_day",
        reply: [
          "You can still take the meds within 6 hrs of usual time. " +
          "Don't double your dose the next day if you missed a day.",
          "\n1. Back"
        ].join("\n")
      })
      .check(function(api){
        var metrics = api.metrics.stores.test_metric_store;
        assert.deepEqual(metrics['enter.state_skip_a_day'], {agg: 'sum', values: [1]});
      })
      .run();
  });
});
describe("state_reminders", function() {
  it("should show the reminders_menu", function() {
    return tester.setup.user
      .state("state_reminders")
      .check.interaction({
        reply: [
          "What would you like to do?",
          "1. Show my next expected clinic date",
          "2. Change my next clinic date",
          "3. Plan for my clinic visit",
          "4. Back to menu"
        ].join("\n")
      })
      .run();
  });
  it("should show an error for invalid choice", function() {
    return tester.setup.user
      .state("state_reminders")
      .inputs("5")
      .check.interaction({
        state:"state_reminders",
        reply: [
          "Please try again. e.g. 1.",
          "1. Show my next expected clinic date",
          "2. Change my next clinic date",
          "3. Plan for my clinic visit",
          "4. Back to menu"
        ].join("\n")
      })
      .run();
  });
  /* Figure out how to hit a rapidpro endpoint and show the clinic visit date */

  it("should show the change clinic date screen", function() {
    return tester.setup.user
      .state("state_reminders")
      .inputs("2")
      .check.interaction({
        state:"state_new_clinic_date",
        reply: [
          "When is your next expected clinic date?",
          "Reply with the full date in the format YYYY-MM-DD"
        ].join("\n")
      })
      .check(function(api){
        var metrics = api.metrics.stores.test_metric_store;
        assert.deepEqual(metrics['enter.state_new_clinic_date'], {agg: 'sum', values: [1]});
      })
      .run();
  });
  /*Validate date format here */

  it("should show the date display screen", function() {
    return tester
      .setup.user.state("state_clinic_date_display")
      .setup.user.answer("state_new_clinic_date", "2020-08-24")
      .check.interaction({
        reply: [
          "You entered 2020-08-24. " +
          "I'll send you reminders of your upcoming clinic visits " +
          "so that you don't forget.",
          "1. Confirm",
          "2. Back"
        ].join("\n")
      })
      .run();
  });
  it("should show the clinic confirm screen on valid input", function() {
    return tester
      .setup.user.state("state_new_clinic_date")
      .input(daysFromNow(60))
      .check.user.state("state_clinic_date_display")
      .check(function(api){
        var metrics = api.metrics.stores.test_metric_store;
        assert.deepEqual(metrics['enter.state_clinic_date_display'], {agg: 'sum', values: [1]});
      })
      .run();
  });
  it("should return errors for invalid input", function() {
    return tester
      .setup.user.state("state_new_clinic_date")
      .input("2021-02-24")
      .check.interaction({
        reply:[
          "Oops, that day has already passed. Please try again."
        ].join("\n")
      })
      .run();
  });

  it("should submit the new clinic date", function() {
    return tester
      .setup.user.state("state_clinic_date_display")
      .setup.user.answers({
        state_new_clinic_date: "2020-08-24"
      })
      .setup(function(api) {
        api.http.fixtures.add(
          fixtures_rapidpro.start_flow(
            "change-next-clinic-visit-flow-id", null, "whatsapp:27123456789", {
              "clinic_date": "2020-08-24"
            })
        );
      })
      .input("1")
      .check.interaction({
        state: "state_change_clinic_date_success",
        reply: [
          "Your next clinic visit has been " +
          "changed to 2020-08-24",
          "1. Back",
          "2. Exit"
        ].join("\n")
      })
      .check(function(api){
        var metrics = api.metrics.stores.test_metric_store;
        assert.deepEqual(metrics['enter.state_change_clinic_date_success'], {agg: 'sum', values: [1]});
      })
      .run();
  });
});
describe("state_habit_plan", function() {
  it("should show the habit plan screen", function() {
    return tester.setup.user
      .state("state_habit_plan")
      .check.interaction({
        reply: [
          "Doing something every day is a habit.",
          "\nBuild a treatment habit:",
          "Add it to your daily schedule",
          "Tick it off",
          "Plan for changes",
          "Give yourself time",
          "\n1. Back"
        ].join("\n")
      })
      .run();
  });
});
describe("state_profile", function() {
  it("should show the profile menu", function() {
    return tester.setup.user
      .state("state_profile")
      .check.interaction({
        reply: [
          "What would you like to view?",
          "1. See my info",
          "2. Change my info",
          "3. Opt-out",
          "4. Back to menu"
        ].join("\n")
      })
      .run();
  });
  it("should show the opt-out screen on optout choice", function() {
    return tester.setup.user
      .state("state_profile")
      .inputs("3")
      .check.interaction({
        state:"state_opt_out",
        reply: [
          "Do you want to stop getting Menconnect messages?",
          "1. Yes",
          "2. No",
          "3. I only want to get clinic visit reminders"
        ].join("\n")
      })
      .check(function(api){
        var metrics = api.metrics.stores.test_metric_store;
        assert.deepEqual(metrics['enter.state_opt_out'], {agg: 'sum', values: [1]});
      })
      .run();
  });
  it("should show the next clinic date with the time trimmed out", function() {
    return tester.setup.user
      .state("state_clinic_date_reminders_optout")
      .setup.user.answer("contact", {
        fields: {
          next_clinic_visit: "2021-12-20T15:42:05.516708+2:00"
        }
      })
      .check.interaction({
        state:"state_clinic_date_reminders_optout",
        reply: [
          "Based on what you told me, I think your next clinic visit is 2021-12-20." ,
          "1. Yes",
          "2. No"
        ].join("\n")
      })
      .run();
  });
  it("should show the next None as next clinic date if field is not retrievable", function() {
    return tester.setup.user
      .state("state_clinic_date_reminders_optout")
      .setup.user.answer("contact", {
        fields: {
          next_clinic_visit: "None"
        }
      })
      .check.interaction({
        state:"state_clinic_date_reminders_optout",
        reply: [
          "Based on what you told me, I think your next clinic visit is None." ,
          "1. Yes",
          "2. No"
        ].join("\n")
      })
      .run();
  });
  it("should show the change clinic date screen if the user does a reminder only opt out", function() {
    return tester.setup.user
      .state("state_clinic_date_reminders_optout")
      .inputs("2")
      .check.interaction({
        state:"state_new_clinic_date_opt_out",
        reply: [
          "When is your next expected clinic date?",
          "Reply with the full date in the format YYYY-MM-DD"
        ].join("\n")
      })
      .check(function(api){
        var metrics = api.metrics.stores.test_metric_store;
        assert.deepEqual(metrics['enter.state_new_clinic_date_opt_out'], {agg: 'sum', values: [1]});
      })
      .run();
  });
  it("should show the reminder confirm screen on valid input", function() {
    return tester
      .setup.user.state("state_new_clinic_date_opt_out")
      .input(daysFromNow(60))
      .check.user.state("state_clinic_reminder_confirm")
      .check(function(api){
        var metrics = api.metrics.stores.test_metric_store;
        assert.deepEqual(metrics['enter.state_clinic_reminder_confirm'], {agg: 'sum', values: [1]});
      })
      .run();
  });
  it("should return errors for invalid input", function() {
    return tester
      .setup.user.state("state_new_clinic_date_opt_out")
      .input(daysFromNow(2 * 365))
      .check.interaction({
        reply:[
          "Hmm, that seems a bit far away. " +
          "You should at least be going to the clinic every 2 months. " +
          "Please try again."
        ].join("\n")
      })
      .run();
  });
});
describe("state_profile", function () {
  it("should show the opt-out screen", function(){
    return tester.setup.user
      .state("state_opt_out")
      .check.interaction({
        reply: [
          "Do you want to stop getting Menconnect messages?",
          "1. Yes",
          "2. No",
          "3. I only want to get clinic visit reminders"
        ].join("\n")
      })
      .run();
  });
});
  describe("state_opt_out_full_delete_reason", function () {
    it("should show the opt-out full delete reason screen", function(){
      return tester.setup.user
        .state("state_opt_out_full_delete_reason")
        .check.interaction({
          reply: [
            "Your info will be permanently deleted. " +
            "Why do you want to stop?",
            "1. Msgs aren't helpful",
            "2. Don't need support",
            "3. Not on treatment",
            "4. Too many msgs",
            "5. Other"
          ].join("\n")
        })
        .run();
    });
});
describe("state_submit_opt_out", function() {
  it("should start the opt out flow with reminder-only metadata", function() {
    return tester
      .setup.user.state("state_delete_data_confirm")
      .setup.user.answers({
        state_opt_out: "state_opt_out_partial",
        state_opt_out_partial: "state_opt_out_full_delete_reason",
        state_opt_out_full_delete_reason: "Msgs aren't helpful",
        state_new_clinic_date_opt_out: ""
      })
      .setup(function(api) {
        api.http.fixtures.add(
          fixtures_rapidpro.start_flow(
            "optout-flow-id",
            null,
            "whatsapp:27123456789",
            {
              "delete_info_consent":"True",
              "reminder_optout":"False",
              "clinic_date":"",
              "optout_full_delete_reason":"Msgs aren't helpful",
            }
          )
        );
      })
      .input("1")
      .check.interaction({
        state: "state_forget_all_success",
        reply: [
          "Your info will be permanently deleted and you'll no longer get messages from MenConnect. ",
          "\nYou can rejoin MenConnect by dialling *134*406#"
        ].join("\n")
      })
      .check(function(api){
        assert.equal(api.http.requests.length, 1);
        assert.equal(
          api.http.requests[0].url, "https://rapidpro/api/v2/flow_starts.json"
        );
      })
      .run();
  });
  it("should start the opt out flow with no-delete history metadata", function() {
    return tester
      .setup.user.state("state_delete_data_confirm")
      .setup.user.answers({
        state_opt_out: "state_opt_out_partial",
        state_opt_out_partial: "state_opt_out_partial_delete_reason",
        state_opt_out_partial_delete_reason: "Msgs aren't helpful",
        state_new_clinic_date_opt_out: ""
      })
      .setup(function(api) {
        api.http.fixtures.add(
          fixtures_rapidpro.start_flow(
            "optout-flow-id",
            null,
            "whatsapp:27123456789",
            {
              "delete_info_consent":"False",
              "reminder_optout":"False",
              "clinic_date":"",
              "optout_partial_delete_reason":"Msgs aren't helpful",
            }
          )
        );
      })
      .input("1")
      .check.interaction({
        state: "state_partial_forget_success",
        reply: [
          "You'll no longer receive messages from MenConnect. ",
          "\nYou can always rejoin MenConnect by dialling *134*406#"
        ].join("\n")
      })
      .check(function(api){
        assert.equal(api.http.requests.length, 1);
        assert.equal(
          api.http.requests[0].url, "https://rapidpro/api/v2/flow_starts.json"
        );
      })
      .run();
  });
  it("should start a flow with correct reminder opt out metadata", function() {
    return tester
      .setup.user.state("state_clinic_reminder_confirm")
      .setup.user.answers({
        state_opt_out: "state_clinic_date_reminders_optout",
        state_opt_out_partial: "",
        state_opt_out_partial_delete_reason: "",
        state_new_clinic_date_opt_out: "2021-03-25"
      })
      .setup(function(api) {
        api.http.fixtures.add(
          fixtures_rapidpro.start_flow(
            "optout-flow-id",
            null,
            "whatsapp:27123456789",
            {
              "delete_info_consent":"False",
              "reminder_optout":"True",
              "clinic_date":"2021-03-25",
              "optout_partial_delete_reason":"",
            }
          )
        );
      })
      .input("1")
      .check.interaction({
        state: "state_reminder_only_success",
        reply: [
          "Thank you!",
          "\nI'll send you reminders of your upcoming clinic visits so you don't forget."
        ].join("\n")
      })
      .check(function(api){
        assert.equal(api.http.requests.length, 1);
        assert.equal(
          api.http.requests[0].url, "https://rapidpro/api/v2/flow_starts.json"
        );
      })
      .run();
  });
});
describe("state_profile_view_info", function() {
    it("should handle missing contact fields", function() {
      return tester
        .setup.user.state("state_profile_view_info")
        .setup.user.answer("contact", {
          language: null,
          name: null,
          fields: {
            preferred_channel: null,
            age_group: null,
            treatment_start_period: null
          }
        })
        .check.interaction({
          reply: [
            "Name: None",
            "Cell number: 0123456789",
            "Channel: None",
            "Age: None",
            "Language: None",
            "Estimated treatment start date: None",
            "1. Change info",
            "2. Back"
          ].join("\n")
        })
        .run();
    });
    it("should display contact data page 1", function() {
      return tester
        .setup.user.state("state_profile_view_info")
        .setup.user.answer("contact", {
          language: "en",
          name: "Chima",
          fields: {
            preferred_channel: "WhatsApp",
            age_group: "15-19",
            treatment_start_period: "<3 months"
          }
        })
        .check.interaction({
          reply: [
            "Name: Chima",
            "Cell number: 0123456789",
            "Channel: WhatsApp",
            "Age: 15-19",
            "Language: en",
            "Estimated treatment start date: <3 months",
            "1. Change info",
            "2. Back"
          ].join("\n")
        })
        .run();
    });
  });
describe("state_new_name", function () {
    it("should ask for a new name", function() {
      return tester
        .setup.user.state("state_new_name")
        .check.interaction({
          reply:
          "What name would you like me to call you instead?"
        })
      .run();
    });
    it("should submit the new name", function() {
      return tester
        .setup.user.state("state_new_name_display")
        .setup.user.answers({
          state_new_name: "Jeff"
        })
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_rapidpro.start_flow(
              "change-name-flow-id", null, "whatsapp:27123456789", {
                "new_name": "Jeff"
              })
          );
        })
        .input("1")
        .check.interaction({
          state: "state_change_name_success",
          reply: [
            "Thanks. I'll call you Jeff\n",
            "What would you like to do next?",
            "1. Back to main menu",
            "2. Exit"
          ].join("\n")
        })
        .check(function(api) {
          var metrics = api.metrics.stores.test_metric_store;
          assert.deepEqual(metrics['enter.state_change_name_success'], {agg: 'sum', values: [1]});
          assert.equal(api.http.requests.length, 1);
          assert.equal(
            api.http.requests[0].url, "https://rapidpro/api/v2/flow_starts.json"
          );
        })
        .run();
    });
  });
describe("state_target_msisdn", function(){
    it("should ask the user for the new msisdn", function() {
      return tester
        .setup.user.state("state_target_msisdn")
        .check.interaction({
          reply:
          "Please reply with the *new cell number* you would like to get " +
                    "your MenConnect messages on, e.g 0813547654"
        })
        .run();
    });
    it("should display an error on invalid input", function() {
      return tester
        .setup.user.state("state_target_msisdn")
        .input("A")
        .check.interaction({
          reply:
          "Sorry that is not a real cellphone number. " +
          "Please reply with the 10 digit number that you'd like " +
            "to get your MenConnect messages on."
        })
        .run();
    });
    it("should display an error if the user uses the example msisdn", function() {
      return tester
        .setup.user.state("state_target_msisdn")
        .input("0813547654")
        .check.interaction({
          reply:
            "We're looking for your information. Please avoid entering " +
              "the examples in the messages. Enter your details."
        })
        .run();
    });
    it("should go to state_active_subscription if the msisdn is registered", function () {
      return tester
        .setup.user.state("state_target_msisdn")
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_rapidpro.get_contact({
              urn: "whatsapp:27820001001",
              exists: true,
              fields: {
                consent: "true"
              }
            })
          );
        })
      .input("0820001001")
      .check.user.state("state_active_subscription")
      .run();
  });
  it("should go to state_display_number if the MSISDN is not registered", function () {
    return tester
      .setup.user.state("state_target_msisdn")
      .setup(function(api) {
        api.http.fixtures.add(
          fixtures_rapidpro.get_contact({
            urn: "whatsapp:27820001001",
            exists: false,
          })
        );
      })
      .input("0820001001")
      .check.user.state("state_display_number")
      .run();
  });
  it("should trigger the number change if they select yes", function() {
    return tester
      .setup.user.state("state_display_number")
      .setup.user.answers({
        state_target_msisdn: "0820001001",
        contact: {uuid: "contact-uuid"}
      })
      .setup(function(api) {
        api.http.fixtures.add(
          fixtures_rapidpro.start_flow(
            "msisdn-change-flow-id", null, "whatsapp:27820001001", {
              new_msisdn: "+27820001001",
              old_msisdn: "+27123456789",
              contact_uuid: "contact-uuid",
              source: "POPI USSD"
            }
          )
        );
      })
      .input("1")
      .check.user.state("state_change_msisdn_success")
      .check(function(api){
        var metrics = api.metrics.stores.test_metric_store;
        assert.deepEqual(metrics['enter.state_change_msisdn_success'], {agg: 'sum', values: [1]});
      })
      .run();
  });
});
describe("state_change_msisdn_success", function() {
  it("should tell the user the number change succeeded", function() {
    return tester
      .setup.user.state("state_change_msisdn_success")
      .setup.user.answer("state_target_msisdn", "0820001001")
      .check.interaction({
        reply: [
          "Thanks! We sent a msg to 0820001001. Follow the instructions. ",
          "What would you like to do?",
          "1. Back",
          "2. Exit"
        ].join("\n")
      })
      .run();
  });
});
describe("state_new_age", function() {
    it("should show the age menu", function() {
      return tester.setup.user
        .state("state_new_age")
        .check.interaction({
          reply: [
            "How old are you?",
            "Select your age group:",
            "1. <15",
            "2. 15-19",
            "3. 20-24",
            "4. 25-29",
            "5. 30-34",
            "6. 35-39",
            "7. 40-44",
            "8. 45-49",
            "9. 50+"
          ].join("\n")
        })
        .run();
    });
    it("should show the erorr screen", function() {
      return tester.setup.user
        .state("state_new_age")
        .inputs("10")
        .check.interaction({
          state:"state_new_age",
          reply: [
            "Sorry, please reply with the number that matches your answer, e.g. 1.",
            "1. <15",
            "2. 15-19",
            "3. 20-24",
            "4. 25-29",
            "5. 30-34",
            "6. 35-39",
            "7. 40-44",
            "8. 45-49",
            "9. 50+"
          ].join("\n")
        })
        .run();
    });
    it("should submit the change", function() {
      return tester
        .setup.user.state("state_age_display")
        .setup.user.answers({
          state_new_age: "15-19"
        })
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_rapidpro.start_flow(
              "change-age_group-flow-id", null, "whatsapp:27123456789", {
                "age_group": "15-19"
              })
          );
        })
        .input("1")
        .check.interaction({
          state: "state_change_age_success",
          reply: [
            "Thank you. Your age has been changed to 15-19\n",
            "1. Back to main menu",
            "2. Exit"
          ].join("\n")
        })
        .check(function(api) {
          assert.equal(api.http.requests.length, 1);
          assert.equal(
            api.http.requests[0].url, "https://rapidpro/api/v2/flow_starts.json"
          );
        })
        .run();
    });
    it("should show the age group the user entered", function() {
    return tester
      .setup.user.state("state_change_age_success")
      .setup.user.answer("state_new_age", "15-19")
      .check.interaction({
        reply: [
          "Thank you. Your age has been changed to 15-19\n",
          "1. Back to main menu",
          "2. Exit"
        ].join("\n")
      })
      .run();
  });

  it("should show the new name the user entered", function() {
    return tester
      .setup.user.state("state_display_name")
      .setup.user.answer("state_new_name", "Jonathan")
      .check.interaction({
        reply: [
          "Thanks, I'll call you Jonathan",
          "\nWhat do you want to do next?",
          "1. Back to menu",
          "2. Exit"
        ].join("\n")
      })
      .run();
  });
});
describe("state_channel_switch_confirm", function() {
  it("should ask the user if they want to switch channels", function() {
    return tester
      .setup.user.state("state_channel_switch_confirm")
      .setup.user.answer("contact", {fields: {preferred_channel: "SMS"}})
      .check.interaction({
        reply: [
          "Are you sure you want to get your MenConnect messages on WhatsApp?",
          "1. Yes",
          "2. No"
        ].join("\n")
      })
      .run();
  });
  it("should show the user an error on invalid input", function() {
    return tester
      .setup.user.state("state_channel_switch_confirm")
      .setup.user.answer("contact", {fields: {preferred_channel: "SMS"}})
      .input("A")
      .check.interaction({
        reply: [
          "Sorry we don't recognise that reply. Please enter the number next to " +
          "your answer.",
          "1. Yes",
          "2. No"
        ].join("\n")
      })
      .run();
  });
  it("should submit the channel switch if they choose yes", function() {
    return tester
      .setup.user.state("state_channel_switch_confirm")
      .setup.user.answer("contact", {fields: {preferred_channel: "SMS"}})
      .setup(function(api) {
        api.http.fixtures.add(
          fixtures_rapidpro.start_flow(
            "whatsapp-switch-flow-id", null, "whatsapp:27123456789"
          )
        );
      })
      .input("1")
      .check.interaction({
        reply: [
          "Okay. I'll send you MenConnect messages on WhatsApp." +
          "To move back to WhatsApp, reply *WA* or dial *134*406#.",
          "1. Back",
          "2. Exit"
        ].join("\n"),
        state: "state_channel_switch_success"
        })
        .check(function(api) {
        assert.equal(api.http.requests.length, 1);
        assert.equal(
        api.http.requests[0].url, "https://rapidpro/api/v2/flow_starts.json"
        );
      })
      .run();
  });
});
describe("state_new_treatment_start_date", function() {
  it("should ask for a new treatment start date", function() {
    return tester
      .setup.user.state("state_new_treatment_start_date")
      .check.interaction({
        reply: [
        "When did you start taking ARV treatment? " +
        "Choose the closest option.\n",
        "1. today",
        "2. <1 week",
        "3. <1 month",
        "4. <3 months",
        "5. 3-6 months",
        "6. 6-12 months",
        "7. >1 year"
        ].join("\n")
      })
      .run();
  });
  it("should submit the new treatment_start_date", function() {
    return tester
      .setup.user.state("state_new_treatment_date_display")
      .setup.user.answers({
        state_new_treatment_start_date: "2020-05-20"
      })
      .setup(function(api) {
        api.http.fixtures.add(
          fixtures_rapidpro.start_flow(
            "change-treatment-start-date-flow-id", null, "whatsapp:27123456789", {
              "treatment_start_period": "2020-05-20"
            })
        );
      })

    .input("1")
    .check.interaction({
      state: "state_change_treatment_start_date_success",
      reply: [
        "Thank you. Your treatment start date has " +
        "been changed to 2020-05-20",
        "1. Back to main menu",
        "2. Exit"
      ].join("\n")
    })
    .check(function(api) {
      var metrics = api.metrics.stores.test_metric_store;
      assert.deepEqual(metrics['enter.state_change_treatment_start_date_success'], {agg: 'sum', values: [1]});
      assert.equal(api.http.requests.length, 1);
      assert.equal(
        api.http.requests[0].url, "https://rapidpro/api/v2/flow_starts.json"
      );
    })
    .run();
  });
});

describe("state_processing_info_menu", function() {
  it("should show the processing my info menu", function() {
    return tester.setup.user
      .state("state_processing_info_menu")
      .check.interaction({
        reply: [
          "Choose a question:",
          "1. What info is collected?",
          "2. Why do you need my info?",
          "3. Who can see my info?",
          "4. How long is my info kept?",
          "5. View Privacy Policy",
          "6. Back"
        ].join("\n")
      })
      .run();
  });
  it("should show the confirm share screen", function() {
    return tester.setup.user
      .state("state_processing_info_menu")
      .inputs("1")
      .check.interaction({
        state:"state_menconnect_info",
        reply: [
          "We process your info to help you on your health journey. " +
          "We collect name, age, cell number, language, channel, status, clinic dates, " +
          "& survey answers.",
          "1. Back"
        ].join("\n")
      })
      .run();
  });
});

describe("POPI update for existing users", function() {
  it("state_menconnect_popi - should show the popi screen", function() {
    return tester.setup.user
      .state("state_processing_info_menu")
      .inputs("5")
      .check.interaction({
        state:"state_menconnect_popi",
        reply: [
          "MenConnect Keeps your personal info private & confidential. It's used with " +
          "your consent to send you health messages. You can opt out at any time",
          "1. Next"
        ].join("\n")
      })
      .run();
  });
  it("state_menconnect_popi_consent - should display the correct message SMS", function(){
    return tester
      .setup.user.state("state_menconnect_popi_consent")
      .setup.user.answer(
        "contact", {
          fields: {
            preferred_channel: "SMS"
          }
        }
      )
      .check.interaction({
        reply: [
          "Do you agree to the MenConnect privacy policy that was just sent to you on SMS",
          "1. Yes",
          "2. No"
        ].join("\n")
      })
      .run();
  });
  it("state_menconnect_popi_consent - should display the correct message WhatsApp", function(){
    return tester
      .setup.user.state("state_menconnect_popi_consent")
      .setup.user.answer(
        "contact", {
          fields: {
            preferred_channel: "WhatsApp"
          }
        }
      )
      .check.interaction({
        reply: [
          "Do you agree to the MenConnect privacy policy that was just sent to you on WhatsApp",
          "1. Yes",
          "2. No"
        ].join("\n")
      })
      .run();
  });
  it("state_menconnect_popi_consent - should confirm if user says no", function(){
    return tester
      .setup.user.state("state_menconnect_popi_consent")
      .input("2")
      .check.interaction({
        state: "state_menconnect_popi_no_consent_confirm",
        reply: [
          "Unfortunately you may only access Menconnect if you agree to our " +
          "privacy policy. Would you like to change your mind and accept?",
          "1. Yes",
          "2. No"
        ].join("\n")
      })
      .run();
  });
  it("state_menconnect_popi_no_consent_confirm - should start accept flow if confirmed ", function(){
    return tester
        .setup.user.state("state_menconnect_popi_no_consent_confirm")
        .setup(function(api) {
            api.http.fixtures.add(
                fixtures_rapidpro.start_flow(
                  "popi-consent-flow-uuid", null, "whatsapp:27123456789"
                )
            );
        })
        .input("1")
        .check.interaction({
            state: "state_menconnect_popi_consent_accept",
            reply: [
                "Thank you for accepting the policy."
            ].join("\n")
        })
        .check(function(api) {
            assert.equal(api.http.requests.length, 1);
            assert.equal(
                api.http.requests[0].url, "https://rapidpro/api/v2/flow_starts.json"
            );
        })
        .run();
  });
  it("state_menconnect_popi_no_consent_confirm - should start optout flow if not confirmed ", function(){
    return tester
        .setup.user.state("state_menconnect_popi_no_consent_confirm")
        .setup(function(api) {
            api.http.fixtures.add(
                fixtures_rapidpro.start_flow(
                  "optout-flow-id", null, "whatsapp:27123456789"
                )
            );
        })
        .input("2")
        .check.interaction({
            state: "state_menconnect_popi_consent_reject",
            reply: [
              "I'm sorry to see you go! You can dial *134*406# to rejoin. ",
              "",
              "",
              "For any medical concerns please visit the clinic.",
              "",
              "",
              "Stay healthy!",
              "",
              "Mo"
            ].join("\n")
        })
        .check(function(api) {
            assert.equal(api.http.requests.length, 1);
            assert.equal(
                api.http.requests[0].url, "https://rapidpro/api/v2/flow_starts.json"
            );
        })
        .check.reply.ends_session()
        .run();
  });
  it("state_menconnect_popi_consent_view - should display the correct message SMS", function(){
    return tester
      .setup.user.state("state_menconnect_popi_consent_view")
      .setup.user.answer(
        "contact", {
          fields: {
            preferred_channel: "SMS"
          }
        }
      )
      .check.interaction({
        reply: [
          "The MenConnect privacy policy was just sent to you on SMS",
          "1. Menu",
          "2. Exit"
        ].join("\n")
      })
      .run();
  });
  it("state_menconnect_popi_consent_view - should display the correct message WhatsApp", function(){
    return tester
      .setup.user.state("state_menconnect_popi_consent_view")
      .setup.user.answer(
        "contact", {
          fields: {
            preferred_channel: "WhatsApp"
          }
        }
      )
      .check.interaction({
        reply: [
          "The MenConnect privacy policy was just sent to you on WhatsApp",
          "1. Menu",
          "2. Exit"
        ].join("\n")
      })
      .run();
  });
  it("should submit the popi consent", function() {
    return tester
        .setup.user.state("state_trigger_popi_accept_flow")
        .setup.user.answers({
            state_menconnect_popi_consent: "Yes",
            fields:{
              popi_consent: "yes"
            }
        })
        .setup(function(api) {
            api.http.fixtures.add(
                fixtures_rapidpro.start_flow(
                  "popi-consent-flow-uuid", null, "whatsapp:27123456789"
                )
            );
        })
        .input("1")
        .check.interaction({
            state: "state_menconnect_popi_consent_accept",
            reply: [
                "Thank you for accepting the policy."
            ].join("\n")
        })
        .check(function(api) {
            assert.equal(api.http.requests.length, 1);
            assert.equal(
                api.http.requests[0].url, "https://rapidpro/api/v2/flow_starts.json"
            );
        })
        .run();
  });
});
describe("state_trigger_send_popi_flow", function(){
  it("should start a flow with correct data", function(){
    return tester
        .setup.user.state("state_trigger_send_popi_flow")
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_rapidpro.start_flow(
              "popi-send-flow-uuid",
              null,
              "whatsapp:27123456789"
            )
          );
        })
        .check.user.state("state_menconnect_popi_consent")
        .run();
  });
  it("should retry HTTP call when RapidPro is down", function() {
    return tester
      .setup.user.state("state_trigger_send_popi_flow")
      .setup(function(api) {
        api.http.fixtures.add(
          fixtures_rapidpro.start_flow(
            "popi-send-flow-uuid",
            null,
            "whatsapp:27123456789",
            null,
            true
          )
        );
      })
      .check.interaction({
        state: "__error__",
        reply:
          "Sorry, something went wrong. We have been notified. Please try again later"
      })
      .check(function(api) {
        var metrics = api.metrics.stores.test_metric_store;
        assert.deepEqual(metrics['enter.__error__'], {agg: 'sum', values: [1]});
        assert.equal(api.http.requests.length, 3);
        api.http.requests.forEach(function(request) {
          assert.equal(request.url, "https://rapidpro/api/v2/flow_starts.json");
        });
        assert.equal(api.log.error.length, 1);
        assert(api.log.error[0].includes("HttpResponseError"));
      })
      .run();
  });
});
describe("state_trigger_send_popi_flow_new_registration", function(){
  it("should start a flow with correct data", function(){
    return tester
        .setup.user.state("state_trigger_send_popi_flow_new_registration")
        .setup.user.answers({
          on_whatsapp: false,
        })
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_rapidpro.start_flow(
              "popi-send-flow-uuid",
              null,
              "whatsapp:27123456789",
              {on_whatsapp: "false"}
            )
          );
        })
        .check.user.state("state_menconnect_popi_consent_new_registration")
        .run();
  });
  it("should retry HTTP call when RapidPro is down", function() {
    return tester
      .setup.user.state("state_trigger_send_popi_flow_new_registration")
      .setup.user.answers({
        on_whatsapp: true,
      })
      .setup(function(api) {
        api.http.fixtures.add(
          fixtures_rapidpro.start_flow(
            "popi-send-flow-uuid",
            null,
            "whatsapp:27123456789",
            {on_whatsapp: "true"},
            true
          )
        );
      })
      .check.interaction({
        state: "__error__",
        reply:
          "Sorry, something went wrong. We have been notified. Please try again later"
      })
      .check(function(api) {
        var metrics = api.metrics.stores.test_metric_store;
        assert.deepEqual(metrics['enter.__error__'], {agg: 'sum', values: [1]});
        assert.equal(api.http.requests.length, 3);
        api.http.requests.forEach(function(request) {
          assert.equal(request.url, "https://rapidpro/api/v2/flow_starts.json");
        });
        assert.equal(api.log.error.length, 1);
        assert(api.log.error[0].includes("HttpResponseError"));
      })
      .run();
  });
});
describe("state_share", function() {
  it("should show the share menu", function() {
    return tester.setup.user
      .state("state_share")
      .check.interaction({
        reply: [
          "Do you want to receive an SMS that you can share with other men living with HIV?",
          "1. Yes",
          "2. Back to menu"
        ].join("\n")
      })
      .run();
  });
  it("should start the message send flow", function() {
    return tester
      .setup.user.state("state_share")
      .setup(function(api) {
        api.http.fixtures.add(
          fixtures_rapidpro.start_flow(
            "send-sms-flow-id", null, "whatsapp:27123456789")
        );
      })
      .input("1")
      .check.interaction({
        state: "state_confirm_share",
        reply: [
          "Thank you. You will receive an SMS with info that you can share with " +
          "other men living with HIV.",
          "1. Back to Menu"
        ].join("\n")
      })
      .run();
    });
    it("should go back to state_registered if back to menu is selected", function(){
      return tester
        .setup.user.state("state_share")
        .input("2")
        .check.interaction({state: "state_registered"})
        .run();
    });
  });
  describe("state_confirm_share", function(){
    it("should go back to state_registered", function(){
      return tester
        .setup.user.state("state_confirm_share")
        .input("1")
        .check.interaction({state: "state_registered"})
        .run();
    });
  });

  describe("state_message_consent", function() {
    it("should ask the user for messaging consent", function() {
      return tester.setup.user
        .state("state_message_consent")
        .input({ session_event: "continue" })
        .check.interaction({
          state: "state_message_consent",
          reply: [
            "MenConnect supports men on their journey. I'll send you messages with info & tips." +
              "Do you agree to receive?",
            "1. Yes",
            "2. No"
          ].join("\n")
        })
        .run();
    });
    it("should show the user an error on invalid input", function() {
      return tester.setup.user
        .state("state_message_consent")
        .input("foo")
        .check.interaction({
          state: "state_message_consent",
          reply: [
            "Please try again. Reply with the number that matches your answer, e.g. 1." +
              "\n\nDo you agree to receive messages?",
            "1. Yes",
            "2. No"
          ].join("\n")
        })
        .run();
    });
    it("should confirm if the user denies consent", function() {
      return tester.setup.user
        .state("state_message_consent")
        .input("2")
        .check.interaction({
          state: "state_message_consent_denied",
          reply: ("No problem! " +
            "If you change your mind and want to receive supportive messages in the future," +
            " dial *134*406# and I'll sign you up."
          )
        })
        .check(function(api){
          var metrics = api.metrics.stores.test_metric_store;
          assert.deepEqual(metrics['enter.state_message_consent_denied'], {agg: 'sum', values: [1]});
        })
        .run();
    });
    it("should go to the language page", function() {
      return tester.setup.user
        .state("state_message_consent")
        .input("1")
        .check.interaction({
          state: "state_language",
            reply: [
              "What language would you like to receive messages in?",
              "1. English",
              "2. Zulu",
              "3. Sesotho"
          ].join("\n")
        })
        .check(function(api){
          var metrics = api.metrics.stores.test_metric_store;
          assert.deepEqual(metrics['enter.state_language'], {agg: 'sum', values: [1]});
        })
        .run();
    });
  });
  describe("state_language", function() {
    it("should should ask the users language", function() {
      return tester.setup.user
        .state("state_language")
        .check.interaction({
          reply: [
            "What language would you like to receive messages in?",
            "1. English",
            "2. Zulu",
            "3. Sesotho"
          ].join("\n")
        })
        .run();
    });
    it("should change the language", function() {
      return tester.setup.user
        .state("state_language")
        .input("3")
        .check.user.lang("sot_ZA")
        .run();
    });
    it("should show the user an error on invalid input", function() {
      return tester.setup.user
        .state("state_language")
        .input("foo")
        .check.interaction({
          state: "state_language",
          reply: [
            "Please try again. Reply with the number that matches your answer, e.g. 1",
            "",
            "",
            "What language would you like to receive messages in?",
            "1. English",
            "2. Zulu",
            "3. Sesotho"
          ].join("\n")
        })
        .run();
    });
  });
  describe("Age group", function() {
    it("should show the correct message", function() {
      return tester.setup.user
        .state("state_age_group")
        .inputs("10")
        .check.interaction({
          state: "state_age_group",
          reply: [
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
          ].join("\n")
        })
        .run();
    });
    it("should show an error for invalid choice", function() {
      return tester.setup.user
        .state("state_age_group")
        .inputs("10")
        .check.interaction({
          state: "state_age_group",
          reply: [
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
          ].join("\n")
        })
        .run();
    });
    it("should show the next screen", function() {
      return tester.setup.user
        .state("state_age_group")
        .inputs("9")
        .check.user.state("state_status_known")
        .check(function(api){
          var metrics = api.metrics.stores.test_metric_store;
          assert.deepEqual(metrics['enter.state_status_known'], {agg: 'sum', values: [1]});
        })
        .run();
    });
  });
  describe("state_menconnect_popi_new_registration", function(){
    it("should inform about personal info and consent", function(){
      return tester
        .setup.user.state("state_menconnect_popi_new_registration")
        .check.interaction({
          reply: [
            "MenConnect Keeps your personal info private & confidential. It's used with " +
              "your consent to send you health messages. You can opt out at any time",
            "1. Next"
          ].join("\n")
        })
        .run();
    });
  });
  describe("state_menconnect_popi_consent_new_registration", function(){
    it("should display the correct message SMS", function(){
      return tester
        .setup.user.state("state_menconnect_popi_consent_new_registration")
        .setup.user.answers({
          on_whatsapp: false,
        })
        .check.interaction({
          reply: [
            "Do you agree to the MenConnect privacy policy that was just sent to you on SMS",
            "1. Yes",
            "2. No"
          ].join("\n")
        })
        .run();
    });
    it("should display the correct message SMS", function(){
      return tester
        .setup.user.state("state_menconnect_popi_consent_new_registration")
        .setup.user.answers({
          on_whatsapp: true,
        })
        .check.interaction({
          reply: [
            "Do you agree to the MenConnect privacy policy that was just sent to you on WhatsApp",
            "1. Yes",
            "2. No"
          ].join("\n")
        })
        .run();
    });
  });
  describe("status_known", function() {
    it("should ask the user for their status known period", function() {
      return tester.setup.user
        .state("state_status_known")
        .check.interaction({
          reply: [
            "When were you first diagnosed positive?",
            "1. Today",
            "2. Last week",
            "3. <1 month",
            "4. <3 months",
            "5. 3-6 months",
            "6. 6-12 months",
            "7. > 1 year",
            "8. not positive",
            "9. not sure"
          ].join("\n")
        })
        .run();
    });
    it("should show the treatment started screen", function() {
      return tester.setup.user
        .state("state_status_known")
        .inputs("1")
        .check.interaction({
          state:"state_treatment_started",
          reply: [
            "Are you or have you been on ARV treatment?",
            "1. Yes",
            "2. No"
          ].join("\n")
        })
        .check(function(api){
          var metrics = api.metrics.stores.test_metric_store;
          assert.deepEqual(metrics['enter.state_treatment_started'], {agg: 'sum', values: [1]});
        })
        .run();
    });
  });
  describe("state_treatment_started", function() {
    it("should ask the user if they have been on treatment", function() {
      return tester.setup.user
        .state("state_treatment_started")
        .check.interaction({
          reply: [
            "Are you or have you been on ARV treatment?",
            "1. Yes",
            "2. No"
          ].join("\n")
        })
        .run();
    });
    it("should show an error for invalid choice", function() {
      return tester.setup.user
        .state("state_treatment_started")
        .inputs("foo")
        .check.interaction({
          state:"state_treatment_started",
          reply: [
            "Please try again. Reply with the number that matches your answer, e.g. 1.",
            "Are you or have you been on ARV treatment?",
            "1. Yes",
            "2. No"
          ].join("\n")
        })
        .run();
    });
    it("should show the treatment started date screen", function() {
      return tester.setup.user
        .state("state_treatment_started")
        .inputs("1")
        .check.interaction({
          state:"state_treatment_start_date",
          reply: [
            "When did you start taking ARV treatment?",
            "1. today",
            "2. <1 week",
            "3. <1 month",
            "4. <3 months",
            "5. 3-6 months",
            "6. 6-12 months",
            "7. >1 year"
          ].join("\n")
        })
        .check.user.answer("state_treatment_started", "Yes")
        .check(function(api){
          var metrics = api.metrics.stores.test_metric_store;
          assert.deepEqual(metrics['enter.state_treatment_start_date'], {agg: 'sum', values: [1]});
        })
        .run();
    });
  });
  describe("state_treatment_start_date", function() {
    it("should ask the user for their ARV treatment started date", function() {
      return tester.setup.user
        .state("state_treatment_start_date")
        .check.interaction({
          reply: [
            "When did you start taking ARV treatment?",
            "1. today",
            "2. <1 week",
            "3. <1 month",
            "4. <3 months",
            "5. 3-6 months",
            "6. 6-12 months",
            "7. >1 year"
          ].join("\n")
        })
        .run();
    });
    it("should show an error for invalid choice", function() {
      return tester.setup.user
        .state("state_treatment_start_date")
        .inputs("foo")
        .check.interaction({
          state:"state_treatment_start_date",
          reply: [
            "Please reply with number closest to when you started treatment: ",
            "1. today",
            "2. <1 week",
            "3. <1 month",
            "4. <3 months",
            "5. 3-6 months",
            "6. 6-12 months",
            "7. >1 year"
          ].join("\n")
        })
        .run();
    });
    it("should show the state still on treatment screen", function() {
      return tester.setup.user
        .state("state_treatment_start_date")
        .inputs("1")
        .check.interaction({
          state:"state_still_on_treatment",
          reply: [
            "Are you still taking your treatment?",
            "1. Yes",
            "2. No",
            "3. Mostly - sometimes I forget"
          ].join("\n")
        })
        .check(function(api){
          var metrics = api.metrics.stores.test_metric_store;
          assert.deepEqual(metrics['enter.state_still_on_treatment'], {agg: 'sum', values: [1]});
        })
        .run();
    });
  });
  describe("state_still_on_treatment", function() {
    it("should ask the user for their ARV treatment started date", function() {
      return tester.setup.user
        .state("state_still_on_treatment")
        .check.interaction({
          reply: [
            "Are you still taking your treatment?",
            "1. Yes",
            "2. No",
            "3. Mostly - sometimes I forget"
          ].join("\n")
        })
        .run();
    });
    it("should show an error for invalid choice", function() {
      return tester.setup.user
        .state("state_still_on_treatment")
        .inputs("4")
        .check.interaction({
          state:"state_still_on_treatment",
          reply: [
            "Please try again. Reply with the number that matches your answer, e.g. 1.",
            "1. Yes",
            "2. No",
            "3. Mostly - sometimes I forget"
          ].join("\n")
        })
        .run();
    });
    it("should show the viral detect screen", function() {
      return tester.setup.user
        .state("state_still_on_treatment")
        .inputs("1")
        .check.interaction({
          state:"state_viral_detect",
          reply: [
            "Is your viral load undetectable?",
            "1. Yes",
            "2. No",
            "3. I don't know"
          ].join("\n")
        })
        .check(function(api){
          var metrics = api.metrics.stores.test_metric_store;
          assert.deepEqual(metrics['enter.state_viral_detect'], {agg: 'sum', values: [1]});
        })
        .run();
    });
  });
  describe("state_still_on_treatment", function() {
    it("should ask the user for their viral load", function() {
      return tester.setup.user
        .state("state_viral_detect")
        .check.interaction({
          reply: [
            "Is your viral load undetectable?",
            "1. Yes",
            "2. No",
            "3. I don't know"
          ].join("\n")
        })
        .run();
    });
    it("should show an error for invalid choice", function() {
      return tester.setup.user
        .state("state_viral_detect")
        .inputs("4")
        .check.interaction({
          state:"state_viral_detect",
          reply: [
            "Please try again. Reply with the number that matches your answer, e.g. 1.",
            "Is your viral load undetectable?",
            "1. Yes",
            "2. No",
            "3. I don't know"
          ].join("\n")
        })
        .run();
    });
    it("should show the mo name state", function() {
      return tester.setup.user
        .state("state_viral_detect")
        .inputs("1")
        .check.interaction({
          state:"state_name_mo",
          reply: [
            "One final question from me.",
            "\nMy name is Mo. What's your name?"
          ].join("\n")
        })
        .check(function(api){
          var metrics = api.metrics.stores.test_metric_store;
          assert.deepEqual(metrics['enter.state_name_mo'], {agg: 'sum', values: [1]});
        })
        .run();
    });
  });
  describe("state_name_mo", function() {
    it("should ask the user for user name", function() {
      return tester.setup.user
        .state("state_name_mo")
        .check.interaction({
          reply: [
            "One final question from me.",
            "\nMy name is Mo. What's your name?"
          ].join("\n")
        })
        .run();
    });
    //DO A CONTACT CHECK HERE
  });
  describe("timeout testing", function() {
    it("should go to state_timed_out", function() {
      return tester.setup.user
        .state("state_covid19")
        .inputs({ session_event: "close" }, { session_event: "new" })
        .check.interaction({
          state: "state_timed_out",
          reply: [
            "Welcome to MenConnect. Please select an option:",
            "1. Continue signing up for messages",
            "2. Main menu"
          ].join("\n")
        })
        .run();
    });
    it("should not go to state_timed_out if registration EndState", function() {
      return tester
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_rapidpro.get_contact({
              urn: "whatsapp:27123456789",
              exists: true,
              groups: ["other", "Registered"]
            })
          );
        })
        .setup.user.state("state_registration_complete")
        .input({ session_event: "continue" })
        .check.interaction({
          state: "state_registered",
          reply: [
            "What would you like to view?\n" +
            "1. HIV",
            "2. Treatment",
            "3. Reminders",
            "4. Habit Plan",
            "5. My Profile",
            "6. Processing my info",
            "7. Share",
            "8. Resources"
          ].join("\n")
        })
        .run();
    });
  });
  describe("state_whatsapp_contact_check", function() {
    it("should store the result of the contact check", function() {
      return tester
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_whatsapp.exists({
              address: "+27123456789",
              wait: true
            })
          );
        })
        .setup.user.state("state_whatsapp_contact_check")
        .check.user.answer("on_whatsapp", true)
        .run();
    });
    it("should retry in the case of HTTP failures", function() {
      return tester
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_whatsapp.exists({
              address: "+27123456789",
              wait: true,
              fail: true
            })
          );
        })
        .setup.user.state("state_whatsapp_contact_check")
        .check(function(api) {
          assert.equal(api.http.requests.length, 3);
          api.http.requests.forEach(function(request) {
            assert.equal(
              request.url,
              "https://whatsapp.example.org/v1/contacts"
            );
          });
          assert.equal(api.log.error.length, 1);
          assert(api.log.error[0].includes("HttpResponseError"));
        })
        .run();
    });
  });
  describe("state_research_consent_new_registration_choice", function(){
    it("should display the correct text", function(){
      return tester
        .setup.user.state("state_research_consent_new_registration_choice")
        .check.interaction({
          reply: [
            "May we message you to get your feedback on Menconnect?",
            "1. Yes",
            "2. No"
          ].join("\n")
        })
        .run();
    });
    it("should go to state_research_consent_accept if accepted", function(){
      return tester
        .setup.user.state("state_research_consent_new_registration_choice")
        .inputs("1")
        .check.interaction({
          state: "state_research_consent_accept",
          reply: [
            "Thank you for your consent. Your feedback will help make MenConnect even better",
            "1. Next"
          ].join("\n")
        })
        .run();
    });
    it("should go to state_research_consent_reject if not accepted", function(){
      return tester
        .setup.user.state("state_research_consent_new_registration_choice")
        .inputs("2")
        .check.interaction({
          state: "state_research_consent_reject",
          reply: [
            "No problem, We will NOT contact you for your feedback.",
            "",
            "Remember, you can keep on using MenConnect",
            "1. Next"
          ].join("\n")
        })
        .run();
    });
  });
  describe("state_trigger_rapidpro_flow", function() {
    it("should start a flow with the correct metadata", function() {
      return tester
        .setup.user.state("state_trigger_rapidpro_flow")
        .setup.user.answers({
          state_message_consent: "yes",
          state_language: "eng",
          state_menconnect_popi_consent_new_registration: "yes",
          state_age_group: "<15",
          state_status_known: "<3 months",
          state_still_on_treatment: "yes",
          state_treatment_started: "yes",
          state_treatment_start_date: "<1 month",
          state_viral_detect: "yes",
          state_name_mo: "Jerry",
          state_research_consent_new_registration_choice: "Yes"
        })
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_rapidpro.start_flow(
              "rapidpro-flow-uuid",
              null,
              "whatsapp:27123456789",
              {
                "on_whatsapp":"true",
                "consent":"true",
                "language": "eng",
                "source":"USSD registration *134*406#",
                "timestamp":"2014-04-04T07:07:07Z",
                "registered_by":"+27123456789",
                "mha":6,
                "swt":7,
                "age_group":"<15",
                "status_known_period":"<3 months",
                "treatment_adherent": "yes",
                "treatment_initiated":"yes",
                "treatment_start_period":"<1 month",
                "viral_load_undetectable":"yes",
                "name":"Jerry",
                "research_consent": "Yes"
              }
            )
          );
        })
        .setup.user.answer("on_whatsapp", true)
        .input({ session_event: "continue", to_addr: "*134*406#" })
        .check.user.state("state_registration_complete")
        .run();
    });
    it("should start a flow with the correct metadata for empty values", function() {
      return tester
        .setup.user.state("state_trigger_rapidpro_flow")
        .setup.user.answers({
          state_message_consent: "yes",
          state_language: "eng",
          state_menconnect_popi_consent_new_registration: "yes",
          state_age_group: "<15",
          state_status_known: "<3 months",
          state_treatment_started: "yes",
          state_treatment_start_date: "<1 month",
          state_viral_detect: "yes",
          state_name_mo: "Jerry",
          state_research_consent_new_registration_choice: "Yes"
        })
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_rapidpro.start_flow(
              "rapidpro-flow-uuid",
              null,
              "whatsapp:27123456789",
              {
                "on_whatsapp":"true",
                "consent":"true",
                "language": "eng",
                "source":"USSD registration *134*406#",
                "timestamp":"2014-04-04T07:07:07Z",
                "registered_by":"+27123456789",
                "mha":6,
                "swt":7,
                "age_group":"<15",
                "status_known_period":"<3 months",
                "treatment_adherent": "No",
                "treatment_initiated":"yes",
                "treatment_start_period":"<1 month",
                "viral_load_undetectable":"yes",
                "name":"Jerry",
                "research_consent": "Yes"
              }
            )
          );
        })
        //.setup.user.state("state_trigger_rapidpro_flow")
        .setup.user.answer("on_whatsapp", true)
        .input({ session_event: "continue", to_addr: "*134*406#" })
        .check.user.state("state_registration_complete")
        .run();
    });
    it("should retry in the case of HTTP failures", function() {
      return tester
        .setup.user.state("state_trigger_rapidpro_flow")
        .setup.user.answers({
          state_message_consent: "yes",
          state_language: "eng",
          state_menconnect_popi_consent_new_registration: "yes",
          state_age_group: "<15",
          state_status_known: "<3 months",
          state_still_on_treatment: "yes",
          state_treatment_started: "yes",
          state_treatment_start_date: "<1 month",
          state_viral_detect: "yes",
          state_name_mo: "Jerry",
          state_research_consent_new_registration_choice: "Yes"
        })
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_rapidpro.start_flow(
              "rapidpro-flow-uuid",
              null,
              "whatsapp:27123456789",
              {
                "on_whatsapp":"false",
                "consent":"true",
                "language": "eng",
                "source":"USSD registration *134*406#",
                "timestamp":"2014-04-04T07:07:07Z",
                "registered_by":"+27123456789",
                "mha":6,
                "swt":1,
                "age_group":"<15",
                "status_known_period":"<3 months",
                "treatment_adherent":"yes",
                "treatment_initiated":"yes",
                "treatment_start_period":"<1 month",
                "viral_load_undetectable":"yes",
                "name":"Jerry",
                "research_consent": "Yes"
              },
              true
            )
          );
        })
        .setup.user.state("state_trigger_rapidpro_flow")
        .setup.user.answer("on_whatsapp", false)
        .input({ session_event: "continue", to_addr: "*134*406#" })
        .check(function(api) {
          assert.equal(api.http.requests.length, 3);
          api.http.requests.forEach(function(request) {
            assert.equal(
              request.url,
              "https://rapidpro/api/v2/flow_starts.json"
            );
          });
          assert.equal(api.log.error.length, 1);
          assert(api.log.error[0].includes("HttpResponseError"));
        })
        .run();
    });
  });
  describe("state_registration_complete", function() {
    it("should show the correct message", function() {
      return (
        tester
        .setup.user.state("state_trigger_rapidpro_flow")
        .setup.user.answers({
          state_message_consent: "yes",
          state_language: "eng",
          state_menconnect_popi_consent_new_registration: "yes",
          state_age_group: "<15",
          state_status_known: "<3 months",
          state_still_on_treatment: "yes",
          state_treatment_started: "yes",
          state_treatment_start_date: "<1 month",
          state_viral_detect: "yes",
          state_name_mo: "Jerry",
          state_research_consent_new_registration_choice: "Yes"
        })
          .setup(function(api) {
            api.http.fixtures.add(
              fixtures_whatsapp.exists({
                address: "+27123456789",
                wait: true
              })
            );
            api.http.fixtures.add(
              fixtures_rapidpro.start_flow(
                "rapidpro-flow-uuid",
                null,
                "whatsapp:27123456789",
                {
                  "on_whatsapp":"true",
                  "consent":"true",
                  "language": "eng",
                  "source":"USSD registration *134*406#",
                  "timestamp":"2014-04-04T07:07:07Z",
                  "registered_by":"+27123456789",
                  "mha":6,
                  "swt":7,
                  "age_group":"<15",
                  "status_known_period":"<3 months",
                  "treatment_adherent":"yes",
                  "treatment_initiated":"yes",
                  "treatment_start_period":"<1 month",
                  "viral_load_undetectable":"yes",
                  "name":"Jerry",
                  "research_consent": "Yes"
                }
              )
            );
          })
          // For some reason, if we start the test on state_registration_complete, it skips to state_start,
          // so we need to start it before
          //.setup.user.state("state_whatsapp_contact_check")
          .setup.user.answer("on_whatsapp", true)
          .input({ session_event: "continue" , to_addr: "*134*406#"})
          .check.interaction({
            state: "state_registration_complete",
            reply:
            "You're done! You will get info & tips on 0123456789 to support you on your journey on " +
            "WhatsApp. " +
            "Thanks for signing up to MenConnect!"
          })
          .check(function(api){
            var metrics = api.metrics.stores.test_metric_store;
            assert.deepEqual(metrics['enter.state_registration_complete'], {agg: 'sum', values: [1]});
          })
          .run()
      );
    });
    it("should show the correct message if SMS", function() {
      return (
        tester
        .setup.user.state("state_trigger_rapidpro_flow")
        .setup.user.answers({
          state_message_consent: "yes",
          state_language: "eng",
          state_menconnect_popi_consent_new_registration: "yes",
          state_age_group: "<15",
          state_status_known: "<3 months",
          state_still_on_treatment: "yes",
          state_treatment_started: "yes",
          state_treatment_start_date: "<1 month",
          state_viral_detect: "yes",
          state_name_mo: "Jerry",
          state_research_consent_new_registration_choice: "Yes",
          on_whatsapp: false
        })
          .setup(function(api) {
            api.http.fixtures.add(
              fixtures_whatsapp.not_exists({
                address: "+27123456789",
                wait: true
              })
            );
            api.http.fixtures.add(
              fixtures_rapidpro.start_flow(
                "rapidpro-flow-uuid",
                null,
                "whatsapp:27123456789",
                {
                  "on_whatsapp":"false",
                  "consent":"true",
                  "language": "eng",
                  "source":"USSD registration *134*406#",
                  "timestamp":"2014-04-04T07:07:07Z",
                  "registered_by":"+27123456789",
                  "mha":6,
                  "swt":1,
                  "age_group":"<15",
                  "status_known_period":"<3 months",
                  "treatment_adherent":"yes",
                  "treatment_initiated":"yes",
                  "treatment_start_period":"<1 month",
                  "viral_load_undetectable":"yes",
                  "name":"Jerry",
                  "research_consent": "Yes"
                }
              )
            );
          })
          // For some reason, if we start the test on state_registration_complete, it skips to state_start,
          // so we need to start it before
          .input({ session_event: "continue", to_addr: "*134*406#" })
          .check.interaction({
            state: "state_registration_complete",
            reply:
            "You're done! You will get info & tips on 0123456789 to support you on your journey on " +
            "SMS. " +
            "Thanks for signing up to MenConnect!"
          })
          .check(function(api) {
            var metrics = api.metrics.stores.test_metric_store;
            assert.deepEqual(metrics['enter.state_registration_complete'], {agg: 'sum', values: [1]});

          })
          .run()
      );
    });
  });
});
