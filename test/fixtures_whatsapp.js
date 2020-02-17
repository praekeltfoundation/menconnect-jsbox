module.exports = function() {
  function make_lookups_fixture(params, exists) {
    return {
      repeatable: true,
      request: {
        method: "POST",
        headers: {
          Authorization: ["Bearer api-token"],
          "Content-Type": ["application/json"]
        },
        url: "https://whatsapp.example.org/v1/contacts",
        data: {
          blocking: params.wait ? "wait" : "no_wait",
          contacts: [params.address]
        }
      },
      response: {
        code: params.fail ? 500 : 200,
        data: {
          contacts: [
            {
              input: params.address,
              status: exists ? "valid" : "invalid"
            }
          ]
        }
      }
    };
  }

  return {
    exists: function(params) {
      return make_lookups_fixture(params, true);
    },
    not_exists: function(params) {
      return make_lookups_fixture(params, false);
    },
    silly: "javascript commas"
  };
};
