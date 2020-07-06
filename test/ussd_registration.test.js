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
            "8. Resources",
            "9. Exit"
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
            "8. Resources",
            "9. Exit"
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
            "6. Back to menu"
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
            "6. Back to menu"
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
            "6. Back to menu"
          ].join("\n")
        })
        .run();
    });
    it("should show what HIV is", function() {
      return tester.setup.user
        .state("state_hiv")
        .inputs("1")
        .check.interaction({
          state:"state_what_is_hiv",
          reply: [
            "It's a virus that enters your body through blood / bodily fluids.",
            "It attacks your CD4 cells that protect your body against disease.",
            "1. Back"
          ].join("\n")
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
            "It's a virus that enters your body through blood / bodily fluids.",
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
            "6. Back to menu"
          ].join("\n")
        })
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
        .check.user.state("state_message_consent_denied")
        .run();
    });
    it("should go to the age group page", function() {
      return tester.setup.user
        .state("state_message_consent")
        .input("1")
        .check.user.state("state_age_group")
        .run();
    });
  });
  describe.skip("state_message_consent_denied", function() {
    it("should tell the user to confirm that they want to decline consent", function() {
      return tester.setup.user
        .state("state_message_consent_denied")
        .check.interaction({
          state: "state_message_consent_denied",
          reply: [
              "No problem! If you change your mind and want to receive supportive messages " +
              "in the future, dial *134*406# and I'll sign you up.",
              "1. Next",
              "2. Back"
          ].join("\n")
        })
        .run();
    });
    it("should show the second page", function() {
      return tester.setup.user
        .state("state_message_consent_denied")
        .input("1")
        .check.interaction({
            reply: [
              "You've chosen to not receive menconnect messages." + 
                "Reply *Yes* to confirm.",
                "1. Previous",
                "2. Back"
          ].join("\n")
        })
        .run();
    });


    it("should return to first paginated page", function() {
      return tester.setup.user
        .state("state_message_consent_denied")
        .input("2")
        .check.interaction({
            reply: [
              "You've chosen to not receive menconnect messages." + 
                "Reply *Yes* to confirm.",
                "1. Previous",
                "2. Back"
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
        .input("2")
        .check.user.state("state_message_consent")
        .run();
    });
    it("should exit if the user selects that option", function() {
      return tester.setup.user
        .state("state_message_consent_denied")
        .input("Yes")
        .check.interaction({
          state: "state_exit",
          reply:
            "Thank you for considering MenConnect. We respect your decision. Have a lovely day."
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
            "4. Last 3 months",
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
            "1. Today",
            "2. Last week",
            "3. Last month",
            "4. Last 3 months",
            "5. 3-6 months",
            "6. 6-12 months",
            "7. >1 year"
          ].join("\n")
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
            "1. Today",
            "2. Last week",
            "3. Last month",
            "4. Last 3 months",
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
            "Please reply with number closest to when you started treatment:",
            "1. Today",
            "2. Last week",
            "3. Last month",
            "4. Last 3 months",
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
  describe.skip("timeout testing", function() {
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
          reply: [
            "Hello You are already registered for Menconnect"
          ]
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
  describe.skip("state_trigger_rapidpro_flow", function() {
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
  describe.skip("state_registration_complete", function() {
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
