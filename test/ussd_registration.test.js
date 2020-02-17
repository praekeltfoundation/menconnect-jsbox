var vumigo = require("vumigo_v02");
var AppTester = vumigo.AppTester;
var assert = require("assert");
var fixtures_rapidpro = require("./fixtures_rapidpro")();
var fixtures_whatsapp = require("./fixtures_whatsapp")();

describe("ussd_registration app", function() {
  var app;
  var tester;

  beforeEach(function() {
    app = new go.app.GoMenConnect();
    tester = new AppTester(app);
    tester.setup.config.app({
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
      flow_uuid: "rapidpro-flow-uuid"
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
          assert.equal(api.http.requests.length, 3);
          api.http.requests.forEach(function(request) {
            assert.equal(request.url, "https://rapidpro/api/v2/contacts.json");
          });
          assert.equal(api.log.error.length, 1);
          assert(api.log.error[0].includes("HttpResponseError"));
        })
        .run();
    });

    it("should got to already registered state", function() {
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
        .run();
    });

    it("should go to the information consent state if they are not registered yet", function() {
      return tester
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_rapidpro.get_contact({
              urn: "whatsapp:27123456789",
              exists: true
            })
          );
        })
        .check.user.state("state_info_consent")
        .run();
    });
  });

  describe("state_info_consent", function() {
    it("should ask the user for consent to use their info", function() {
      return tester.setup.user
        .state("state_info_consent")
        .input({ session_event: "continue" })
        .check.interaction({
          state: "state_info_consent",
          reply: [
            "MenConnect needs to process your personal info to send you relevant messages. Do you agree?",
            "1. Yes",
            "2. No"
          ].join("\n")
        })
        .run();
    });

    it("should show an error if the user replies with an incorrect choice", function() {
      return tester.setup.user
        .state("state_info_consent")
        .input("foo")
        .check.interaction({
          state: "state_info_consent",
          reply: [
            "Sorry, please reply with the number next to your answer. Do you agree?",
            "1. Yes",
            "2. No"
          ].join("\n")
        })
        .run();
    });

    it("should skip the state if they have already given info consent", function() {
      return tester.setup.user
        .state("state_info_consent")
        .setup.user.answer("contact", { fields: { info_consent: "TRUE" } })
        .input({ session_event: "continue" })
        .check.user.state("state_message_consent")
        .run();
    });

    it("should ask for message consent if they agree", function() {
      return tester.setup.user
        .state("state_info_consent")
        .input("1")
        .check.user.state("state_message_consent")
        .run();
    });

    it("should go to exit state if they don't accept ", function() {
      return tester.setup.user
        .state("state_info_consent")
        .input("2")
        .check.user.state("state_exit")
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
            "Do you agree to receiving messages from MenConnect? This may include receiving messages on " +
              "public holidays and weekends.",
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
            "Sorry, please reply with the number next to your answer. Do you agree to receiving messages " +
              "from MenConnect?",
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
        .check.user.state("state_message_consent_denied")
        .run();
    });
  });
  describe("state_message_consent_denied", function() {
    it("should give the user an option to go back or exit", function() {
      return tester.setup.user
        .state("state_message_consent_denied")
        .input({ session_event: "continue" })
        .check.interaction({
          state: "state_message_consent_denied",
          reply: [
            "Unfortunately, without agreeing we can't send MenConnect to you. " +
              "Do you want to agree to get messages from MenConnect?",
            "1. Yes",
            "2. No"
          ].join("\n")
        })
        .run();
    });
    it("should show the user an error if they enter an incorrect choice", function() {
      return tester.setup.user
        .state("state_message_consent_denied")
        .input("foo")
        .check.interaction({
          state: "state_message_consent_denied",
          reply: [
            "Sorry, please reply with the number next to your answer. You've chosen not to receive " +
              "MenConnect messages and so cannot complete registration.",
            "1. Yes",
            "2. No"
          ].join("\n")
        })
        .run();
    });
    it("should go back if the user selects that option", function() {
      return tester.setup.user
        .state("state_message_consent_denied")
        .input("1")
        .check.user.state("state_message_consent")
        .run();
    });
    it("should exit if the user selects that option", function() {
      return tester.setup.user
        .state("state_message_consent_denied")
        .input("2")
        .check.interaction({
          state: "state_exit",
          reply:
            "Thank you for considering MenConnect. We respect your decision. Have a lovely day."
        })
        .run();
    });
  });
  describe("timeout testing", function() {
    it("should go to state_timed_out", function() {
      return tester.setup.user
        .state("state_info_consent")
        .inputs({ session_event: "close" }, { session_event: "new" })
        .check.interaction({
          state: "state_timed_out",
          reply: [
            "Welcome back. Please select an option:",
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
          reply: "Hello You are already registered for Menconnect"
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
  describe("state_trigger_rapidpro_flow", function() {
    it("should start a flow with the correct metadata", function() {
      return tester
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_rapidpro.start_flow(
              "rapidpro-flow-uuid",
              null,
              "whatsapp:27123456789",
              {
                on_whatsapp: "TRUE",
                source: "USSD registration"
              }
            )
          );
        })
        .setup.user.state("state_trigger_rapidpro_flow")
        .setup.user.answer("on_whatsapp", true)
        .input({ session_event: "continue" })
        .check.user.state("state_registration_complete")
        .run();
    });
    it("should retry in the case of HTTP failures", function() {
      return tester
        .setup(function(api) {
          api.http.fixtures.add(
            fixtures_rapidpro.start_flow(
              "rapidpro-flow-uuid",
              null,
              "whatsapp:27123456789",
              {
                on_whatsapp: "FALSE",
                source: "USSD registration"
              },
              true
            )
          );
        })
        .setup.user.state("state_trigger_rapidpro_flow")
        .setup.user.answer("on_whatsapp", false)
        .input({ session_event: "continue" })
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
                  on_whatsapp: "TRUE",
                  source: "USSD registration"
                }
              )
            );
          })
          // For some reason, if we start the test on state_registration_complete, it skips to state_start,
          // so we need to start it before
          .setup.user.state("state_whatsapp_contact_check")
          .setup.user.answer("on_whatsapp", false)
          .input({ session_event: "continue" })
          .check.interaction({
            state: "state_registration_complete",
            reply:
              "You're done! This number 0123456789 will get helpful messages from MenConnect"
          })
          .run()
      );
    });
  });
});
