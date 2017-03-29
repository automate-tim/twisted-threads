Meteor.methods({
  //////////////////////
  // Pattern management
  show_pattern_tags: function() {
    // for internal use only
    console.log("All tags " + Meteor.tags.find().fetch().map(function(tag) {return tag.name}));
  },
  can_create_pattern: function() {
    if (!Meteor.userId())
      return false;

    var count = Patterns.find({created_by: Meteor.userId()}).count();

    if (Roles.userIsInRole( Meteor.userId(), 'verified', 'users' ))
    {
      if (Roles.userIsInRole( Meteor.userId(), 'premium', 'users' ))
      {
        if (count < Meteor.settings.public.max_patterns_per_user.premium)
          return true;

        else
          return false;
      }
      else
      {
        if (count < Meteor.settings.public.max_patterns_per_user.verified)
          return true;

        else
          return false;
      }
    }
    // if the user's email address is not verified, they can only create 1 pattern
    else
    {
      if (count < Meteor.settings.public.max_patterns_per_user.default)
        return true;

      else 
        return false;
    }
  },
  new_pattern_from_json: function(options) {
    // options
    /* {
      name: "pattern name", //optional
      data: json data object,
      filename: "pattern.json" // one of filename or data is required
    } */

    // if number_of_tablets and number_of_rows are both specified, a blank pattern will be built with style 1 for all weaving and threading cells

    check(options, {
      edit_mode: Match.Optional(String),
      number_of_tablets: Match.Optional(String),
      number_of_rows: Match.Optional(String),
      name: Match.Optional(String),
      data: Match.Optional(Object),
      filename: Match.Optional(String) 
    });

    if (!Meteor.isServer) // minimongo cannot simulate loading data with Assets
        return;

    if (!Meteor.userId()) {
      // Only logged in users can create patterns
      throw new Meteor.Error("not-authorized", "You must be signed in to create a new pattern");
    }

    var result = Meteor.call('can_create_pattern');
    if (!result)
      throw new Meteor.Error("not-authorized", "You may not create any more patterns");

    if (typeof options.data !== "undefined")
    {
      var data = options.data;
    }
    else if (typeof options.filename !== "undefined")
    {
      try {
        var data = JSON.parse(Assets.getText(options.filename));
      }
      catch(e)
      {
        //return -1;
        throw new Meteor.Error("file-load-failed", "File load error in new_pattern_from_json");
      }
    }
    else
    {
      //return -1;
      throw new Meteor.Error("file-load-failed", "File load error in new_pattern_from_json");
    }

    // check version
    var version = [0,0];
    if (typeof data.version !== "undefined")
    {
      var split_version = data.version.split("."); // [main, subsidiary] e.g. 2.1
      if (typeof split_version[0] !== "undefined")
      {
        version[0] = parseInt(split_version[0]);

        if (typeof split_version[1] !== "undefined")
        {
          version[1] = parseInt(split_version[1]);
        }
      } 
    }

    // Numbers of rows and tablets
    // have both rows and tablets been specified as positive integers less than 100?
    var build_new = true; // whether to build a blank pattern using a specified number of tablets and rows
    if ((typeof options.number_of_tablets !== "undefined") && (typeof options.number_of_rows !== "undefined"))
    {
      var tablets = parseInt(options.number_of_tablets);

      if (isNaN(tablets))
        build_new = false;

      else if ((tablets <1) || (tablets > 100))
        build_new = false;

      var rows = parseInt(options.number_of_rows);

      if ((rows <1) || (rows > 100))
        if (options.edit_mode != "simulation") // simulation pattern builds its own weaving chart
          build_new = false;
    }
    else
    {
      build_new = false;
    }

    if (build_new)
    {
      // build pattern data
      // weaving
      data.weaving = new Array();

      for (var i=0; i<options.number_of_rows; i++)
      {
        data.weaving[i] = new Array();
        for (var j=0; j<options.number_of_tablets; j++)
        {
          //data.weaving[i][j] = (j >= options.number_of_tablets/2) ? 19 :20; // warp twined
          data.weaving[i][j] = ((j % 2) == 0) ? 5 :6;
        }
      }

      // threading
      data.threading = new Array(options.number_of_rows);

      for (var i=0; i<4; i++)
      {
        data.threading[i] = new Array(options.number_of_tablets);
        for (var j=0; j<options.number_of_tablets; j++)
        {
          data.threading[i][j] = 2; // plain yellow in default pattern
        }
      }

      // orientation
      data.orientation = new Array(number_of_tablets);
      for (var i=0; i<options.number_of_tablets; i++)
      {
        data.orientation[i] = (i % 2 == 0) ? "S" : "Z";
      }
    }
    else if (typeof data.threading[0] === "undefined") // no rows of threading have been defined
    {
      throw new Meteor.Error("no-threading-data", "error creating pattern from JSON. No threading data");
    }

    var number_of_rows = data.weaving.length;
    var number_of_tablets = data.threading[0].length; // there may be no weaving rows but there must be threading

    // try to prevent huge patterns that would fill up the database
    if (number_of_rows > Meteor.settings.private.max_pattern_rows)
      throw new Meteor.Error("too-many-rows", "error creating pattern from JSON. Too many rows.");

    if (number_of_rows > Meteor.settings.private.max_pattern_tablets)
      throw new Meteor.Error("too-many-tablets", "error creating pattern from JSON. Too many tablets.");

    if(options.name == "")
      options.name = Meteor.my_params.default_pattern_name;

    data.name = options.name;

    // edit_mode "freehand" (default) or "simulation"
    if((options.edit_mode == "") || (typeof options.edit_mode === "undefined"))
      options.edit_mode = "freehand"; // earlier data version

    if((data.edit_mode == "") || (typeof data.edit_mode === "undefined"))
      data.edit_mode = options.edit_mode;

    // tags
    if (typeof data.tags === "undefined")
      data.tags = [];

    var description ="";
    if (typeof data.description !== "undefined")
      description = data.description;

    var weaving_notes = "";
    if (typeof data.weaving_notes !== "undefined")
      weaving_notes = data.weaving_notes;

    var weft_color = Meteor.settings.private.default_weft_color;
    if (typeof data.weft_color !== "undefined")
      weft_color = data.weft_color;

    if (typeof data.preview_rotation === "undefined")
      data.preview_rotation = "left";

    var threading_notes = "";
    if (typeof data.threading_notes !== "undefined")
      threading_notes = data.threading_notes;

    var pattern_id = Patterns.insert({
      name: data.name,
      edit_mode: data.edit_mode,
      description: description,
      weaving_notes: weaving_notes,
      preview_rotation: data.preview_rotation,
      weft_color: weft_color,
      threading_notes: threading_notes,
      private: true, // patterns are private by default so the user can edit them before revealing them to the world
      // TODO add specific thumbnails for patterns
      number_of_rows: number_of_rows,
      number_of_tablets: number_of_tablets,
      created_at: moment().valueOf(),            // current time
      created_by: Meteor.userId(),           // _id of logged in user
      created_by_username: Meteor.user().username  // username of logged in user
    });

    // Tags
    for (var i=0; i<data.tags.length; i++)
    {
      Patterns.addTag(data.tags[i], { _id: pattern_id });
    }

    // Styles
    var styles_array = [];

    if (data.edit_mode == "simulation") // palette shows 7 regular styles for threading. The other 32 are used to automatically build the weaving chart: 4 per threading styles to show S/Z and turn forwards, backwards
    {
      var styles;

      if (typeof data.simulation_styles !== "undefined")
        styles = data.simulation_styles; // new pattern
      else if (typeof data.styles !== "undefined")
        styles = data.styles; // copy of existing pattern JSON
      else
        throw new Meteor.Error("no-styles-data", "error creating pattern from JSON. No styles data.");

      for (var i=0; i<styles.length; i++)
      {
        styles_array[i] = styles[i];
      }
    }
    else // 32 visible styles for manually drawing threading and weaving charts
    {
      for (var i=0; i<32; i++) // create 32 styles
      {
        styles_array[i] = data.styles[i];

        // version 1 has style.backward_stroke, style.forward_stroke
        // convert to 2+
        // style.stroke "forward" "backward" "none (other values possible in 2+)
        
        if (data.styles[i].backward_stroke)
          data.styles[i].warp = "backward";
          
        if (data.styles[i].forward_stroke) // if both defined, choose forward
          data.styles[i].warp = "forward";
          
        delete data.styles[i].backward_stroke;
        delete data.styles[i].forward_stroke;

        if (typeof data.styles[i].warp === "undefined")
          data.styles[i].warp = "none";
      }
    }

    Patterns.update({_id: pattern_id}, {$set: {styles: JSON.stringify(styles_array)}});

    // Special styles
    var special_styles_array = [];
    if (typeof data.special_styles === "undefined")
      data.special_styles = [];

    for (var i=0; i<Meteor.my_params.special_styles_number; i++)
    {
      special_styles_array[i] = data.special_styles[i];
    }
    Patterns.update({_id: pattern_id}, {$set: {special_styles: JSON.stringify(special_styles_array)}});

    // Pattern
    var weaving = new Array(number_of_rows);
    for (var i=0; i<number_of_rows; i++)
    {
      weaving[i] = new Array(number_of_tablets);

      for (var j=0; j<number_of_tablets; j++)
      {
        weaving[i][j] = data.weaving[i][j];
      }
    }

    Patterns.update({_id: pattern_id}, {$set: {weaving: JSON.stringify(weaving)}});

    //////////////////////////////
    if (data.edit_mode == "simulation")
    {
      // auto or manual. New patterns default to "freehand". Patterns from JSON may be either.
      if((data.simulation_mode == "") || (typeof data.simulation_mode === "undefined"))
        data.simulation_mode = "auto";

      Patterns.update({_id: pattern_id}, {$set: {simulation_mode: data.simulation_mode}});

      // auto and manual turn sequences exist so the user can switch between them without losing data
      // track current rotation of each tablet
      if(typeof data.position_of_A === "undefined")
      {
        data.position_of_A = new Array();
        for (var i=0; i<number_of_tablets; i++)
        {
          data.position_of_A.push(0);
        }
      }

      Patterns.update({_id: pattern_id}, {$set: {position_of_A: JSON.stringify(data.position_of_A)}});

      // auto_turn_sequence e.g. FFFFBBBB
      if(typeof data.auto_turn_sequence === "undefined")
        data.auto_turn_sequence = ["F","F","F","F","B","B","B","B"]; // default to 4 forward, 4 back
      //data.auto_turn_sequence = ["F","F","F","F","B","B","B","B","B","B","B","B","F","F","F","F"];

      Patterns.update({_id: pattern_id}, {$set: {auto_turn_sequence: data.auto_turn_sequence}});

      // manual_weaving_turns, 3 packs each tablet turned individually
      // create row 0 which is never woven, it is a default and working row
      // actual weaving begins with row 1, 2...
      if((data.manual_weaving_turns == "") || (typeof data.manual_weaving_turns === "undefined"))
        data.manual_weaving_turns = [];

        var new_turn = {
          tablets: [], // for each tablet, the pack number
          packs: [] // turning info for each pack
        }

        for (var i=1; i<=Meteor.my_params.number_of_packs; i++)
        {
          var pack = {
            pack_number: i,
            direction: "F",
            number_of_turns: 1
          }
          new_turn.packs.push(pack);
        }
          
        for (var j=0; j<number_of_tablets; j++)
        {
          new_turn.tablets.push(1); // all tablets start in pack 1
        }

        data.manual_weaving_turns[0] = new_turn;

        Patterns.update({_id: pattern_id}, {$set: {manual_weaving_turns: JSON.stringify(data.manual_weaving_turns)}});

      /*
      3 packs, each tablet in one pack
      for each pack, each pick: turn direction, number of turns 0,1,2,3
      export JSON, import JSON

      use this to build weaving chart dynamically
      */
    }
    /////////////////////////////////

    // Threading
    var threading = new Array(4);
    for (var i=0; i< 4; i++)
    {
      threading[i] = new Array(number_of_tablets);

      for (var j=0; j<number_of_tablets; j++)
      {
        threading[i][j] = data.threading[i][j];
      }
    }

    Patterns.update({_id: pattern_id}, {$set: {threading: JSON.stringify(threading)}});

    // Orientation
    var orientation = new Array(number_of_tablets);
    for (var i=0; i<number_of_tablets; i++)
    {
      orientation[i] = data.orientation[i];
    }

    Patterns.update({_id: pattern_id}, {$set: {orientation: JSON.stringify(orientation)}});

    ///////////////////////////////////
    //
    ///////////////////////////////////

    return pattern_id;
  },
  /////////////////////////////////////
  // New: create collection data from an existing dynamic arrays
  /////////////////////////////////////
  create_new_data_from_arrays: function(pattern_id, weaving_data) {
    check(pattern_id, String);
    check(weaving_data, Array);

    var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1}});

    if (pattern.created_by != Meteor.userId())
      throw new Meteor.Error("not-authorized", "You can only create data for patterns that you created");
  },
  xml2js: function(data) {
    // use xml2js package to convert XML to JSON
    // see https://github.com/Leonidas-from-XIV/node-xml2js for documentation of xml2js
    check(data, String);

    var convertAsyncToSync  = Meteor.wrapAsync( xml2js.parseString ),
      resultOfAsyncToSync = convertAsyncToSync( data, {} ); // {} would be 'this' context if required
    return resultOfAsyncToSync;

    /*
    package:
    https://github.com/peerlibrary/meteor-xml2js
    meteor add peerlibrary:xml2js

    usage:
    https://github.com/Leonidas-from-XIV/node-xml2js

    wrapasync tutorial:
    https://themeteorchef.com/snippets/synchronous-methods/#tmc-using-wrapasync

    // usage from client:
    var data = "<root>Hello xml2js! New2</root>";
    Meteor.call('xml2js',data, function(error, result){
      if (!error) {
      console.log("got xml " + JSON.stringify(result));
      }
      else {
        console.log(error);
      }
    })
    */
  },
  ///////////////////////////////
  // Modify patterns
  remove_pattern: function(pattern_id) {
    check(pattern_id, String);

    if (!Meteor.isServer) // attempt to avoid error "server sent add for existing id"
        return;

    var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1}});

    if (pattern.created_by != Meteor.userId())
      throw new Meteor.Error("not-authorized", "You can only remove patterns that you created");

    Patterns.remove(pattern_id);
    Recent_Patterns.remove({pattern_id: pattern_id});
    Images.remove({used_by: pattern_id});
  },
  set_private: function (pattern_id, set_to_private) {
    check(pattern_id, String);
    check(set_to_private, Boolean);

    var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1}});

    if (pattern.created_by != Meteor.userId())
      throw new Meteor.Error("not-authorized", "You can only change the privacy on a pattern you created");
 
    Patterns.update(pattern_id, { $set: { private: set_to_private } });
  },
  ///////////////////////////////
  // Stringify pattern data and save it
  save_weaving_as_text: function(pattern_id, text, number_of_rows, number_of_tablets)
  {
    check(pattern_id, String);
    check(text, String);
    check(number_of_rows, Number);
    check(number_of_tablets, Number);

    var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1 }});

    if (pattern.created_by != Meteor.userId())
        // Only the owner can edit a pattern
        throw new Meteor.Error("not-authorized", "You can only edit cells in a pattern you created");

    // try to prevent huge patterns that would fill up the database
    if (number_of_rows > Meteor.settings.private.max_pattern_rows)
      throw new Meteor.Error("too-many-rows", "error saving pattern. Too many rows.");

    if (number_of_rows > Meteor.settings.private.max_pattern_tablets)
      throw new Meteor.Error("too-many-tablets", "error saving pattern. Too many tablets.");

    // Save the individual cell data
    var pattern = Patterns.findOne({_id: pattern_id}); // TODO remove
;
    Patterns.update({_id: pattern_id}, {$set: { weaving: text}});

    // Record the number of rows
    Patterns.update({_id: pattern_id}, {$set: {number_of_rows: number_of_rows}});

    // Record the number of tablets
    Patterns.update({_id: pattern_id}, {$set: {number_of_tablets: number_of_tablets}});

    // Record the edit time
    Meteor.call("save_pattern_edit_time", pattern_id);
  },
  save_number_of_tablets: function(pattern_id, number_of_tablets)
  {
    check(pattern_id, String);
    check(number_of_tablets, Number);

    Patterns.update({_id: pattern_id}, {$set: {number_of_tablets: number_of_tablets}});
  },
  save_preview_as_text: function(pattern_id, data)
  {
    check(pattern_id, String);
    check(data, String);

    Patterns.update({_id: pattern_id}, {$set: {auto_preview: data}});
  },
  rotate_preview: function(pattern_id)
  {
    check(pattern_id, String);

    var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1, preview_rotation: 1 }});

    if (pattern.created_by != Meteor.userId())
        // Only the owner can edit a pattern
        throw new Meteor.Error("not-authorized", "You can only edit a pattern you created");      

    if (typeof pattern.preview_rotation === "undefined")
      Patterns.update({_id: pattern_id}, {$set: {preview_rotation: "left"}});

    switch(pattern.preview_rotation)
    {
      case "left":
        Patterns.update({_id: pattern_id}, {$set: {preview_rotation: "right"}});
        break;

      case "right":
        Patterns.update({_id: pattern_id}, {$set: {preview_rotation: "left"}});
        break;

      default:
      console.log("default rotate pattern");
          Patterns.update({_id: pattern_id}, {$set: {preview_rotation: "left"}});
    }
    var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1, preview_rotation: 1}});
  },
  save_threading_as_text: function(pattern_id, text)
  {
    check(pattern_id, String);
    check(text, String);

    var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1 }});

    if (pattern.created_by != Meteor.userId())
        // Only the owner can edit a pattern
        throw new Meteor.Error("not-authorized", "You can only edit cells in a pattern you created");

    // Save the individual cell data
    Patterns.update({_id: pattern_id}, {$set: { threading: text}});

    // Record the edit time
    Meteor.call("save_pattern_edit_time", pattern_id);
  },
  save_weft_color_as_text: function(pattern_id, text)
  {
    check(pattern_id, String);
    check(text, String);

    var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1 }});

    if (pattern.created_by != Meteor.userId())
        // Only the owner can edit a pattern
        throw new Meteor.Error("not-authorized", "You can only edit cells in a pattern you created");

    // Save the individual cell data
    Patterns.update({_id: pattern_id}, {$set: { weft_color: text}});

    // Record the edit time
    Meteor.call("save_pattern_edit_time", pattern_id);
  },
  save_orientation_as_text: function(pattern_id, text)
  {
    check(pattern_id, String);
    check(text, String);

    var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1 }});

    if (pattern.created_by != Meteor.userId())
        // Only the owner can edit a pattern
        throw new Meteor.Error("not-authorized", "You can only edit cells in a pattern you created");

    // Save the individual cell data
    Patterns.update({_id: pattern_id}, {$set: { orientation: text}});

    // Record the edit time
    Meteor.call("save_pattern_edit_time", pattern_id);
  },
  save_styles_as_text: function(pattern_id, text)
  {
    check(pattern_id, String);
    check(text, String);

    var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1 }});

    if (pattern.created_by != Meteor.userId())
        // Only the owner can edit a pattern
        throw new Meteor.Error("not-authorized", "You can only edit styles in a pattern you created");

    // Save the individual cell data
    Patterns.update({_id: pattern_id}, {$set: { styles: text}});

    // Record the edit time
    Meteor.call("save_pattern_edit_time", pattern_id);
  },
  save_manual_weaving_turns: function(pattern_id, text)
  {
    check(pattern_id, String);
    check(text, text);

    var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1 }});

    if (pattern.created_by != Meteor.userId())
        // Only the owner can edit a pattern
        throw new Meteor.Error("not-authorized", "You can only edit maual weaving turns in a pattern you created");

     Patterns.update({_id: pattern_id}, {$set: {manual_weaving_turns: text}});   
  },
  restore_pattern: function(data)
  {
    check(data, Object);

    var pattern = Patterns.findOne({_id: data._id}, {fields: {created_by: 1 }});

    if (pattern.created_by != Meteor.userId())
        // Only the owner can edit a pattern
        throw new Meteor.Error("not-authorized", "You can only restore a pattern you created");

    // reconstruct the pattern according to the data, e.g. for undo
    Meteor.call('save_weaving_as_text', data._id, JSON.stringify(data.weaving), data.number_of_rows, data.number_of_tablets);
    Meteor.call('save_threading_as_text', data._id, JSON.stringify(data.threading));
    Meteor.call('save_orientation_as_text', data._id, JSON.stringify(data.orientation));
    Meteor.call('save_styles_as_text', data._id, JSON.stringify(data.styles));
    Patterns.update({_id: data._id}, {$unset: {auto_preview: ""}}); // preview must be re-read from the HTML after it has been built
    return;
  },
  update_after_tablet_change: function(data) // required to restore reactivity after tablets have been added or removed
  // it seems to be necessary to change the database
  {
    check(data, Object);

    Meteor.call('save_weaving_as_text', data._id, JSON.stringify(data.weaving), data.number_of_rows, data.number_of_tablets);

    var pattern = Patterns.findOne({_id: data._id}, {fields: {created_by: 1 }});

    if (pattern.created_by != Meteor.userId())
        // Only the owner can edit a pattern
        throw new Meteor.Error("not-authorized", "You can only restore a pattern you created");

    return;
  },
  save_pattern_edit_time: function(pattern_id)
  {
    check(pattern_id, String);
    Patterns.update({_id: pattern_id}, {$set: {pattern_edited_at: moment().valueOf()}});
  },
  ///////////////////////////////
  // Edit other pattern properties
  toggle_hole_handedness: function(pattern_id)
  {
    check(pattern_id, String);

    var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1, hole_handedness: 1}});

    if (pattern.created_by != Meteor.userId())
      // Only the owner can edit a pattern
      throw new Meteor.Error("not-authorized", "You can only edit hole handedness for a pattern you created");

    // default is clockwise if not otherwise specified
    var new_value = "anticlockwise";
    if (pattern.hole_handedness == "anticlockwise")
      new_value = "clockwise";

    Patterns.update({_id: pattern_id}, {$set: {hole_handedness: new_value}});
  },
  add_pattern_thumbnail: function(pattern_id, fileObj)
  {
    console.log("add_pattern_thumbnail");
    console.log("fileObj keys " + Object.keys(fileObj));
  },
  ///////////////////////////////
  // Edit styles
  set_pattern_cell_style: function(pattern_id, row, tablet, new_style)
  {
    check(pattern_id, String);
    check(row, Number);
    check(tablet, Number);
    check(new_style, Number);

    if (Meteor.isServer)
    {
      var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1}});

      if (pattern.created_by != Meteor.userId())
        // Only the owner can edit a pattern
        throw new Meteor.Error("not-authorized", "You can only edit cells in a pattern you created");

      // This construction allows variable properties of the document to be set
      var update = {};
      update["weaving." + row + "." + tablet + ".style"] = new_style;
      Patterns.update({_id: pattern_id}, {$set: update});
    }
  },
  set_threading_cell_style: function(pattern_id, hole, tablet, new_style)
  {
    check(pattern_id, String);
    check(hole, Number);
    check(tablet, Number);
    check(new_style, Number);

    if (Meteor.isServer)
    {
      var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1}});

      if (pattern.created_by != Meteor.userId()) {
        // Only the owner can edit a pattern
        throw new Meteor.Error("not-authorized", "You can only edit threading in a pattern you created");
      }

      // This construction allows variable properties of the document to be set
      var update = {};
      update["threading." + hole + "." + tablet + ".style"] = new_style;
      Patterns.update({_id: pattern_id}, {$set: update});
    }
  },

  //////////////////////////////////////
  // Simulation patterns
  update_simulation_mode: function(pattern_id, simulation_mode) {
    var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1, simulation_mode: 1}});

    if (pattern.created_by != Meteor.userId())
      // Only the owner can edit a pattern
      throw new Meteor.Error("not-authorized", "You can only update simulation mode for a pattern you created");

    if (pattern.simulation_mode == simulation_mode)
      return;

    Patterns.update({_id: pattern_id}, {$set: {simulation_mode: simulation_mode}});

    Patterns.update({_id: pattern_id}, {$set: {weaving: "[]"}});
    Patterns.update({_id: pattern_id}, {$set: {number_of_rows: 0}});

  },
  build_auto_weaving: function(pattern_id)
  {
    check(pattern_id, String);

    var pattern = Patterns.findOne({_id: pattern_id});

    if (pattern.created_by != Meteor.userId())
      // Only the owner can edit a pattern
      throw new Meteor.Error("not-authorized", "You can only build simulation weaving for a pattern you created");

    var weaving = new Array();
    var threading = JSON.parse(pattern.threading);
    var orientations = JSON.parse(pattern.orientation);
    var number_of_tablets = pattern.number_of_tablets;
    var auto_turn_sequence = pattern.auto_turn_sequence;
    var number_of_turns = auto_turn_sequence.length;

    // reset all tablets to start position
    var position_of_A = new Array();
    for (var i=0; i<number_of_tablets; i++)
    {
      position_of_A.push(0);
    }

    for (var j=0; j<number_of_turns; j++)
    {
      var tablet_directions = []; // for each tablet, which direction it turns

      // turn tablets
      for (var i=0; i<number_of_tablets; i++)
      {
        // TODO turn tablets individually

        // if change of direction, no net turn
        var direction = auto_turn_sequence[j];
        var last_direction = auto_turn_sequence[j-1];

        if (direction == last_direction)
        {
          if (auto_turn_sequence[j] == "F")
            position_of_A[i] = Meteor.call("modular_add", position_of_A[i], 1, 4);

          else
            position_of_A[i] = Meteor.call("modular_add", position_of_A[i], -1, 4);
        }
      }

      // find which thread shows in each tablet
      var threading_row = [];

      for (var i=0; i<number_of_tablets; i++)
      {
        // position of A = position_of_A[i] (row)
        // tablet = i (column)
        // thread style = threading[position_of_A[i]][i]
        threading_row.push(threading[position_of_A[i]][i]);
        tablet_directions.push(direction);
      }
      
      var new_row = Meteor.call("build_weaving_chart_row", number_of_tablets, threading_row, orientations, tablet_directions);
      weaving.push(new_row);
    }

    Patterns.update({_id: pattern_id}, {$set: {weaving: JSON.stringify(weaving)}});
    Patterns.update({_id: pattern_id}, {$set: {number_of_rows: number_of_turns}});
    Patterns.update({_id: pattern_id}, {$set: {position_of_A: JSON.stringify(position_of_A)}});
  },
  //////////////////////////////////
  // Manual simulation
  reset_simulation_weaving: function(pattern_id)
  {
    // rebuild the weaving chart from the simulation instructions
    check(pattern_id, String);

    var pattern = Patterns.findOne({_id: pattern_id});

    if (pattern.created_by != Meteor.userId())
      // Only the owner can edit a pattern
      throw new Meteor.Error("not-authorized", "You can only build simulation weaving for a pattern you created");

    if (pattern.simulation_mode == "auto")
    {
      var weaving = new Array();
      var threading = JSON.parse(pattern.threading);
      var orientations = JSON.parse(pattern.orientation);
      var number_of_tablets = pattern.number_of_tablets;
      var auto_turn_sequence = pattern.auto_turn_sequence;
      var number_of_rows = auto_turn_sequence.length;

      // reset all tablets to start position
      var position_of_A = new Array();
      for (var i=0; i<number_of_tablets; i++)
      {
        position_of_A.push(0);
      }

      for (var j=0; j<number_of_rows; j++)
      {
        var tablet_directions = []; // for each tablet, which direction it turns
        var tablet_turns = []; // for each tablet, number of turns
        var direction = auto_turn_sequence[j]; // all tablets turn together
        var threading_row = []; // which thread shows in each tablet
        
        for (var i=0; i<number_of_tablets; i++)
        {
          // turn tablet
          if (direction == "F")
            position_of_A[i] = Meteor.call("modular_add", position_of_A[i], 1, 4);

          else
            position_of_A[i] = Meteor.call("modular_add", position_of_A[i], -1, 4);

          // which thread shows depends on direction of turn
          if (direction == "F") // show thread currently in position D
            var thread_to_show = Meteor.call("modular_add", position_of_A[i], -1, 4);
          else // B: show thread in position A
            var thread_to_show = position_of_A[i];

          // threading[thread_to_show] = row of threading chart
          threading_row.push(threading[thread_to_show][i]);
          tablet_directions.push(direction);
          tablet_turns.push(1); // always turn 1
        }
        
        var new_row = Meteor.call("build_weaving_chart_row", number_of_tablets, threading_row, orientations, tablet_directions, tablet_turns);
        weaving.push(new_row);
      }

      Patterns.update({_id: pattern_id}, {$set: {weaving: JSON.stringify(weaving)}});
      Patterns.update({_id: pattern_id}, {$set: {number_of_rows: number_of_rows}});
      Patterns.update({_id: pattern_id}, {$set: {position_of_A: JSON.stringify(position_of_A)}});
    }
    else if (pattern.simulation_mode == "manual")
    {
      // no rows woven
      // reset all tablets to start position
      var position_of_A = new Array();
      for (var i=0; i<pattern.number_of_tablets; i++)
      {
        position_of_A.push(0);
      }

      Patterns.update({_id: pattern_id}, {$set: {position_of_A: JSON.stringify(position_of_A)}});
      Patterns.update({_id: pattern_id}, {$set: {weaving: JSON.stringify([])}});
      Patterns.update({_id: pattern_id}, {$set: {number_of_rows: 0}});

      // remove manual_weaving_turns except first row which gives UI default
      var manual_weaving_turns = JSON.parse(pattern.manual_weaving_turns);
      Patterns.update({_id: pattern_id}, {$set: {manual_weaving_turns: JSON.stringify([manual_weaving_turns[0]])}});

      for (var i=1; i<manual_weaving_turns.length; i++)
      {
        Meteor.call("weave_row", pattern_id, manual_weaving_turns[i]);
      }
    }
  },
  //////////////////////////////////
  // undo last manual weave row
  unweave_row: function(pattern_id) {
    // unweave the last row
    check(pattern_id, String);

    var pattern = Patterns.findOne({_id: pattern_id});

    var number_of_tablets = pattern.number_of_tablets;
    var manual_weaving_turns = JSON.parse(pattern.manual_weaving_turns);
    var weaving = JSON.parse(pattern.weaving);
    var position_of_A = JSON.parse(pattern.position_of_A);
    var threading = JSON.parse(pattern.threading);
    var orientations = JSON.parse(pattern.orientation);

    var current_row_number = manual_weaving_turns.length;
    var last_row_number = current_row_number - 1;
    var new_row_sequence = manual_weaving_turns[current_row_number-1];

    if (current_row_number <= 1)
      throw new Meteor.Error("not-valid", "You have no rows to unweave");

    if (last_row_number < 0) // this is the first row
      last_row_number = 0; // use default row

    var last_row_data = manual_weaving_turns[last_row_number];
    
    var tablet_directions = []; // for each tablet, which direction it turns

    // turn tablets
    for (var i=0; i<number_of_tablets; i++)
    {
      // find turn direction and number of turns
      var pack_number = new_row_sequence.tablets[i];
      var pack = new_row_sequence.packs[pack_number - 1];
      var direction = pack.direction;
      var number_of_turns = pack.number_of_turns;
      var last_row_pack = last_row_data.tablets[i];
      var last_direction =  last_row_data.packs[last_row_pack - 1].direction;
;
      var change_position = true;
      if ((direction != last_direction) || (current_row_number == 1))
        change_position = false;

      // if change of direction, no net turn
      // first row shows position 0
      if (change_position)
      {
        if (direction == "F")
        position_of_A[i] = Meteor.call("modular_add", position_of_A[i], -1 *number_of_turns, 4);

        else
          position_of_A[i] = Meteor.call("modular_add", position_of_A[i],  number_of_turns, 4);
      }
    }

    weaving.pop(); // remove last row of weaving chart
    manual_weaving_turns.pop();

    // restore packs to previous state
    var last_row = manual_weaving_turns[manual_weaving_turns.length-1];
    manual_weaving_turns[0] = last_row;
   
    Patterns.update({_id: pattern_id}, {$set: {position_of_A: JSON.stringify(position_of_A)}});
    Patterns.update({_id: pattern_id}, {$set: {weaving: JSON.stringify(weaving)}});
    Patterns.update({_id: pattern_id}, {$set: {number_of_rows: weaving.length}});
    Patterns.update({_id: pattern_id}, {$set: {manual_weaving_turns: JSON.stringify(manual_weaving_turns)}});    
  },
  weave_row: function(pattern_id, new_row_sequence) {
    check(pattern_id, String);
    check(new_row_sequence, Object);

    var pattern = Patterns.findOne({_id: pattern_id});

    if (pattern.number_of_rows >= 100)
      throw new Meteor.Error("row-limit-reached", "You cannot weave more than 100 rows.");

    var number_of_tablets = pattern.number_of_tablets;
    var manual_weaving_turns = JSON.parse(pattern.manual_weaving_turns);
    var weaving = JSON.parse(pattern.weaving);
    var position_of_A = JSON.parse(pattern.position_of_A);
    var threading = JSON.parse(pattern.threading);
    var orientations = JSON.parse(pattern.orientation);
    
    var tablet_directions = []; // for each tablet, which direction it turns
    var tablet_turns = []; // for each tablet, number of turns
    var threading_row = [];

    // turn tablets
    for (var i=0; i<number_of_tablets; i++)
    {
      // find turn direction and number of turns
      var pack_number = new_row_sequence.tablets[i];
      var pack = new_row_sequence.packs[pack_number - 1];
      var direction = pack.direction;
      var number_of_turns = pack.number_of_turns;

      // turn tablet
      if (direction == "F")
        position_of_A[i] = Meteor.call("modular_add", position_of_A[i], number_of_turns, 4);

      else
        position_of_A[i] = Meteor.call("modular_add", position_of_A[i], -1 * number_of_turns, 4);

      // which thread shows depends on direction of turn
      if (direction == "F") // show thread currently in position D
        var thread_to_show = Meteor.call("modular_add", position_of_A[i], -1, 4);
      else // B: show thread in position A
        var thread_to_show = position_of_A[i];

      // threading[thread_to_show] = row of threading chart
      threading_row.push(threading[thread_to_show][i]);
      tablet_directions.push(direction);
      tablet_turns.push(number_of_turns);

    }

    var new_row = Meteor.call("build_weaving_chart_row", number_of_tablets, threading_row, orientations, tablet_directions, tablet_turns);

    weaving.push(new_row);

    // save the new row turning sequence
    manual_weaving_turns.push(new_row_sequence);
    manual_weaving_turns[0] = new_row_sequence; // retain current packs UI

    Patterns.update({_id: pattern_id}, {$set: {position_of_A: JSON.stringify(position_of_A)}});
    Patterns.update({_id: pattern_id}, {$set: {weaving: JSON.stringify(weaving)}});
    Patterns.update({_id: pattern_id}, {$set: {number_of_rows: weaving.length}});
    Patterns.update({_id: pattern_id}, {$set: {manual_weaving_turns: JSON.stringify(manual_weaving_turns)}});
  },
  build_weaving_chart_row: function(number_of_tablets, threading_row, orientations, tablet_directions, tablet_turns)
  {
    check(number_of_tablets, Number);
    check(threading_row, [Match.OneOf(Number, String)]);
    check(orientations, [String]);
    check(tablet_directions, [String]);
    check(tablet_turns, [Number]);

    var new_row = new Array(number_of_tablets);

    for (var i=0; i<number_of_tablets; i++)
    {
      var thread_style = threading_row[i];
      var orientation = orientations[i];
      new_row[i] = Meteor.call("weaving_style_from_threading_style", thread_style, orientation, tablet_directions[i], tablet_turns[i]);
    }
    return new_row;
  },
  weaving_style_from_threading_style: function(style_value, orientation, direction, number_of_turns)
  {
    // which style to use on the weaving chart to represent a tablet turning forwards / backwards, with S /Z orientation, and thread colour from threading style
    // simulation styles for weaving appear after the 7 threading styles
    // SF, ZF, ZB, SB are style no. 7 + 4(n-1) + 1,2,3,4
    // TODO number_of_turns 0 - 3 (use special styles in weaving chart)
    check(style_value, Match.OneOf(Number, String));
    check(orientation, String);
    check(direction, String);
    check(number_of_turns, Number);

    if (!Meteor.call("is_style_special", style_value))
    {
      switch(number_of_turns)
      {
        case 0:
          style_name = "S15";
          return style_name;
          break;
        case 2:
          var style_name = "S"

          if(direction == "F")
          {
            if (orientation == "S")
              style_name += 1
            else
              style_name += 2
          }
          else
          {
            if (orientation == "Z")
              style_name += 10
            else
              style_name += 9
          }
          return style_name;
          break;

        case 3:
          var style_name = "S"

          if(direction == "F")
          {
            if (orientation == "S")
              style_name += 3
            else
              style_name += 4
          }
          else
          {
            if (orientation == "Z")
              style_name += 12
            else
              style_name += 11
          }
          return style_name;
          break;

        default:
          var style_number = 7 + 4*(style_value - 1);
      }      
    }
    else
    {
      // special style for empty hole, hard-coded to last 4 styles
      if (style_value == "S7")
        var style_number = 7 + 4*7 // this is the 8th style (7-1)
      else
        return -1; // style does not correspond to a weaving chart style
    }
    if(direction == "F")
    {
      if (orientation == "S")
        style_number += 1
      else
        style_number += 2
    }
    else
    {
      if (orientation == "Z")
        style_number += 3
      else
        style_number += 4
    }
    return style_number;
  },
  modular_add: function(a, b, modulus)
  {
    // addition in modular arithmetic
    check(a, Number);
    check(b, Number);
    check(modulus, Number);

    var result = (a + b) % modulus;

    if (result < 0)
      result += modulus;
    
    return result;
  },
  is_style_special: function(style_value)
  {
    check(style_value, Match.OneOf(Number, String));

    if (typeof style_value === "undefined")
      return false;

    if (style_value.toString().charAt(0) == "S")
      return true;

    else
      return false;
  },
  // auto simulation pattern UI
  set_auto_number_of_turns: function(pattern_id, new_number)
  {
    check(pattern_id, String);
    check(new_number, Number);

    if ((new_number < 1) || (new_number > Meteor.my_params.max_auto_turns))
      return;

    var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1, auto_turn_sequence: 1}});

    if (pattern.created_by != Meteor.userId())
      // Only the owner can edit a pattern
      throw new Meteor.Error("not-authorized", "You can only update number of turns for a pattern you created");

      if (new_number < 1)
        throw new Meteor.Error("not-valid", "You cannot have no turns in the sequence");

    var auto_turn_sequence = pattern.auto_turn_sequence;

    if (auto_turn_sequence.length != new_number)
    {
      var difference = auto_turn_sequence.length - new_number;

      if (difference < 0)
      {
        for (var i=0; i<(-1 * difference); i++)
        {
          auto_turn_sequence.push("F")
        }
      }
      else
      {
        auto_turn_sequence.splice(auto_turn_sequence.length - difference, difference);
      }

      Patterns.update({_id: pattern_id}, {$set: {auto_turn_sequence: auto_turn_sequence}});
    }
  },
  toggle_turn_direction: function(pattern_id, turn_number) {
    // toggle direction of a turn of auto turning, for simulation pattern
    check(pattern_id, String);
    check(turn_number, Number);

    var pattern = Patterns.findOne({_id: pattern_id}, {fields: {created_by: 1, auto_turn_sequence: 1}});

    if (pattern.created_by != Meteor.userId())
      // Only the owner can edit a pattern
      throw new Meteor.Error("not-authorized", "You can only update turn direction for a pattern you created");

    var auto_turn_sequence = pattern.auto_turn_sequence;
    var direction = auto_turn_sequence[turn_number - 1];

    if (direction == "F")
      direction = "B";

    else
      direction = "F";

    auto_turn_sequence[turn_number - 1] = direction;

    Patterns.update({_id: pattern_id}, {$set: {auto_turn_sequence: auto_turn_sequence}});
  },
  //////////////////////////////////////
  // Recent patterns
  add_to_recent_patterns: function(pattern_id) {
    // Add a pattern to the Recent_Patterns collection
    // If it's already in the collection, update the accessed_at time
    // Recent patterns are stored for each user separately
    check(pattern_id, String);

    if (!Meteor.userId()) // user is not signed in
      return;

    if (Patterns.find({_id: pattern_id}, {fields: {_id: 1}}, {limit: 1}).count() == 0)
      return; // the pattern doesn't exist

    if (Recent_Patterns.find({ $and: [{pattern_id: pattern_id}, {user_id: Meteor.userId()}]}, {fields: {_id: 1}}, {limit: 1}).count() == 0)
    {
      // the pattern is not in the list, so add it
      Recent_Patterns.insert({
        pattern_id: pattern_id,
        accessed_at: moment().valueOf(),            // current time
        user_id: Meteor.userId()
      });
    }
    else
    {
      // the pattern is already in the list, so update it

      Recent_Patterns.update({ $and: [{pattern_id: pattern_id}, {user_id: Meteor.userId()}]}, { $set: {accessed_at: moment().valueOf()}});
    }

    if (Recent_Patterns.find({user_id: Meteor.userId()}).count() > Meteor.my_params.max_recents) // don't store too many patterns for any one user
    {
      var oldest_id = Recent_Patterns.find({user_id: Meteor.userId()}, {sort: {accessed_at: 1}}, {limit: 1}).fetch()[0]._id;

      Recent_Patterns.remove({_id: oldest_id});
    }
  },
  maintain_recent_patterns: function() {
    // remove any patterns that no longer exist or are now hidden from the user

    // Publish only returns the patterns the user has permission to see
    var my_patterns = Patterns.find({

    }).map(function(pattern) {return pattern._id});

    Recent_Patterns.remove({pattern_id: {$nin:my_patterns}});
  },
  set_current_weave_row: function(pattern_id, index) {
    check(pattern_id, String);
    check(index, Number);

    if (!Meteor.userId())
      return;

    if (index < 1)
      return;

    var pattern = Patterns.findOne({_id: pattern_id});

    if (typeof pattern === "undefined")
      return;

    var number_of_rows = pattern.number_of_rows;

    if (index > number_of_rows)
      return;

    Recent_Patterns.update({ $and: [{pattern_id: pattern_id}, {user_id:Meteor.userId()}]}, { $set: {current_weave_row: index}});

    return;
  },
  ///////////////////////////////
  // uploaded images
  // Is there already an image with this key?
  does_image_exist: function(key, cb) {

     // check if the image already exists in the S3 bucket
    var s3 = new AWS.S3({
      accessKeyId: Meteor.settings.private.AWSAccessKeyId,
      secretAccessKey: Meteor.settings.private.AWSSecretAccessKey//,
    });

    var params = {
      Bucket: Meteor.settings.private.AWSBucket, // 'mybucket'
      Key: key // 'images/myimage.jpg'
    };

    var my_fn = Meteor.wrapAsync(s3.headObject, s3);
    var results = my_fn(params, function(err, data) {

      if (err)
      {
       throw new Meteor.Error("object does not exist with key " + key);

      } else
      {
        return data;
      }
    });

    return results;
    // callback doesn't seem to work, results has no data and appears before callback
  },
  // Slingshot has added a new image to Amazon S3. Now log in it the Images collection.
  upload_pattern_image: function(downloadUrl, pattern_id, role, width, height){
    check(downloadUrl, NonEmptyString);
    check(pattern_id, NonEmptyString);
    check(role, NonEmptyString);
    check(width, Number);
    check(height, Number);

    var user = Meteor.user();
    if (!Meteor.userId())
      return;

    if (!user.emails[0].verified)
      throw new Meteor.Error("not-authorized", "You can only upload images if you have a verified email address");

    var pattern = Patterns.findOne({_id: pattern_id}, { fields: {created_by: 1}});

    if (pattern.created_by != Meteor.userId())
      throw new Meteor.Error("not-authorized", "You can only upload images for patterns you created"); 
    
    var count = Images.find({ used_by: pattern_id }).count();

    if (Roles.userIsInRole( Meteor.userId(), 'premium', 'users' ))
    {
      if (count >= Meteor.settings.public.max_images_per_pattern.premium)
        throw new Meteor.Error("limit-reached", "You cannot upload any more images for this pattern");
    }
    else
    {
      if (count >= Meteor.settings.public.max_images_per_pattern.verified)
        throw new Meteor.Error("limit-reached", "You cannot upload any more images for this pattern");
    }

    var bucket = Meteor.settings.private.AWSBucket;
    var region = Meteor.settings.public.AWSRegion;

    // Find the key by stripping out the first part of the image url
    var key = downloadUrl.replace('https://' + bucket + ".s3-" + region + '.amazonaws.com/', ''); // used to delete the object from AWS

    if (Images.find({key:key}).count() == 0)
    {
      // add the new object to the Images collection
      var image_id = Images.insert({
          url: downloadUrl,
          key: key,
          created_at: moment().valueOf(),            // current time
          created_by: Meteor.userId(),           // _id of logged in user
          created_by_username: Meteor.user().username,  // username of logged in user
          used_by: pattern_id,
          role: role,
          width: width,
          height: height
       });
      return image_id;
    }
    else
    {
      // uploading a new version of an existing file, just update "created_at"
      var image_id = Images.findOne({key:key}, {fields: {_id:1}});
      Images.update({_id: image_id}, {$set:
        {
          created_at: moment().valueOf()
        }});
    }
  },
  make_preview: function(image_id) {
    check(image_id, NonEmptyString);

    // Does the user have permission to remove this image?
    var image = Images.findOne({ '_id': image_id });

    if (typeof image === "undefined")
      throw new Meteor.Error("not-found", "Image not found: " + image_id);

    if (image.created_by != Meteor.userId())
      throw new Meteor.Error("not-authorized", "You can only remove an image you uploaded");

    if (image.role == "preview")
      return true;

    else
    {
      var pattern_id = image.used_by;
      try {
        var current_preview_id = Images.findOne({used_by:pattern_id, role:"preview"})._id; // remove any existing preview image
        Images.update({_id:current_preview_id}, {$set: {role:"image"}});
      }
      catch(err) {
        // no existing preview, nothing to do here
      }

      Images.update({_id:image_id}, {$set: {role:"preview"}});
    }
  },
  set_image_dimensions: function(image_id, width, height) {
    check(image_id, NonEmptyString);
    check(width, Number);
    check(height, Number);

    // Does the user have permission to edit this image?
    var image = Images.findOne({ '_id': image_id });

    if (typeof image === "undefined")
      throw new Meteor.Error("not-found", "Image not found: " + image_id);

    if (image.created_by != Meteor.userId())
      throw new Meteor.Error("not-authorized", "You can only edit an image you uploaded");

    // landscape or portrait

    // constrain size

    var new_width = width;
    var new_height = height;

    Images.update({_id: image_id}, {$set: {width: new_width, height: new_height}});

  },
  remove_image: function(image_id) {
    check(image_id, NonEmptyString);

    // Does the user have permission to remove this image?
    var image = Images.findOne({ '_id': image_id });

    if (typeof image === "undefined")
      throw new Meteor.Error("not-found", "Image not found: " + image_id);

    if (image.created_by != Meteor.userId())
      throw new Meteor.Error("not-authorized", "You can only remove an image you uploaded");

    // check for too many image removals too fast
    var document_id = Meteor.call('get_actions_log');

    var db_document = ActionsLog.findOne({_id: document_id}, {fields: { image_removed: 1, locked: 1 }} );

    var event_log = db_document.image_removed;

    if (db_document.locked)
    throw new Meteor.Error("account-locked", "Your account has been locked, please contact an administrator");
  
    var number_of_entries = event_log.length;
    var time_since_last_action = moment().valueOf() - event_log[0];

    // try to detect automated image removes
    // A human shouldn't be able to removes 10 images in 2 seconds
    var last_10_actions_in = event_log[0] - event_log[9];
    if (last_10_actions_in < 2000)
    {
      ActionsLog.update( {_id: document_id}, { locked: true } );
      throw new Meteor.Error("account-locked", "Your account has been locked, please contact an administrator");
    }

    var last_5_actions_in = event_log[0] - event_log[4];
      if (last_5_actions_in < 2000)
      {
        // Don't allow another attempt for 5 minutes
        if (time_since_last_action < (60 * 1000 * 5))
          throw new Meteor.Error("too-many-requests", "Please wait 5 mins before retrying");

        // it's been at least 5 mins so consider allowing another image upload
        else
        {
          var previous_5_actions_in = event_log[4] - event_log[9];
          if (previous_5_actions_in < 2000)
          {
            // if the 5 previous actions were in 2 seconds, wait 30 minutes
            // this looks like an automatic process that has tried continually
            if (time_since_last_action < (60 * 1000 * 30 + 4000))
              throw new Meteor.Error("too-many-requests", "Please wait 30 mins before retrying");
          }
        }
      }

      // record the action in the log
      ActionsLog.update( {_id: document_id}, { $push: { image_removed: {
        $each: [moment().valueOf()],
        $position: 0 
      }}} );
  ;
      // remove the oldest log entry if too many stored
      if (number_of_entries > Meteor.settings.private.image_remove_num_to_log)
      {
        ActionsLog.update( {_id: document_id}, { $pop: { image_removed: 1 }} );
      }

    var s3 = new AWS.S3({
      accessKeyId: Meteor.settings.private.AWSAccessKeyId,
      secretAccessKey: Meteor.settings.private.AWSSecretAccessKey//,
    });

    var params = {
      Bucket: Meteor.settings.private.AWSBucket, // 'mybucket'
      Key: image.key // 'images/myimage.jpg'
    };
    
    s3.deleteObject(params, Meteor.bindEnvironment(function (error, data){
      if (!error) {
        var new_preview_needed = false;
        if (image.role == "preview")
        {
          new_preview_needed = true;
          var pattern_id = image.used_by;
        }

        Images.remove({_id: image_id});

        if (new_preview_needed)
        {
          var new_preview_id = Images.findOne({used_by:pattern_id})._id;
          Meteor.call("make_preview", new_preview_id);
        }
      }
    }));
  },
  ///////////////////////////////
  // Edit pattern properties
  update_text_property: function(collection, object_id, property, value)
  {
    // used by the editable_field template
    // this function updates specified text properties of specified collections. It deliberately checks for known collections and properties to avoid unexpected database changes.
    check(object_id, NonEmptyString);
    check(collection, NonEmptyString);
    check(property, NonEmptyString);
    check(value, String);

    if (value.length > 3000)
      throw new Meteor.Error("not-authorized", "Value is too long");

    if (collection == "patterns")
    {
      var pattern = Patterns.findOne({_id: object_id}, { fields: {created_by: 1}});

      if (pattern.created_by != Meteor.userId())
        throw new Meteor.Error("not-authorized", "You can only update patterns you created");

      switch (property)
      {
        case "name":
        case "description":
        case "weaving_notes":
        case "threading_notes":
          if ((property == "name") && (value == ""))
            return; // pattern must have a name

          var update = {};
          update[property] = value; // this construction is necessary to handle a variable property name
          Patterns.update({_id: object_id}, {$set: update});
          
          // Record the edit time
          Meteor.call("save_text_edit_time", object_id);
          return;

          default:
            throw new Meteor.Error("not-authorized", "Unknown property");
      }
    }

    if (collection == "images")
    {
      var image = Images.findOne({_id: object_id});
      var pattern = Patterns.findOne({_id: image.used_by})

      if (pattern.created_by != Meteor.userId())
        throw new Meteor.Error("not-authorized", "You can only update patterns you created");
      // *** TODO check user can edit pattern
      switch (property)
      {
        case "caption":
          var update = {};
          update[property] = value; // this construction is necessary to handle a variable property name
          Images.update({_id: object_id}, {$set: update});
          return;

        default:
          throw new Meteor.Error("not-authorized", "Unknown property");
      }
    }

    if (collection == "users")
    {
      // only the user can update their own profile
      if (object_id != Meteor.userId())
        throw new Meteor.Error("not-authorized", "You can only change your own user details");

      switch (property)
      {
        case "description":
          // correct for me having messed up profiles by setting them as a text string not knowing it already existed
          // profile is an object to which editable properties may be added
          var profile = Meteor.users.findOne({ _id: object_id}).profile;
          if (typeof profile === "undefined")
            profile = {};
          
          profile[property] = value;

          Meteor.users.update({_id: object_id}, {$set: {profile: profile}});
          return;

        case "email_address":
          if (value == "")
            return;

          var old_emails = Meteor.users.findOne({ _id: object_id}).emails;
          if (old_emails) // user may have no emails
            var start_number = old_emails.length;
          else
            var start_number = 0;

          Accounts.addEmail(object_id, value); // I believe this runs synchronously because it is being called on the server

          // If addEmail doesn't throw an error, we can assume that either the new email was added, or it replaced one that was identical apart from case - in the latter case, verification status is unchanged. So the user should have an email address.
          var new_emails = Meteor.users.findOne({ _id: object_id}).emails;
          if (new_emails)
            var end_number = new_emails.length;
          else
            var end_number = 0;

          if (end_number > start_number) // email was successfully added
          {
            // remove any other email addresses - user should only have one.
            for (var i=0; i<new_emails.length; i++)
            {
              if (new_emails[i].address != value)
                Accounts.removeEmail(object_id, new_emails[i].address);
            }
            //Accounts.sendVerificationEmail(object_id);
            Meteor.call('sendVerificationEmail', object_id);
          }

          return;

        default:
          throw new Meteor.Error("not-authorized", "Unknown property");
      }
    }
  },
  save_text_edit_time: function(pattern_id)
  {
    check(pattern_id, String);
    Patterns.update({_id: pattern_id}, {$set: {text_edited_at: moment().valueOf()}});
  },

  ///////////////////////////////
  // user account management
  sendVerificationEmail(userId, email)
  {
    check(userId, NonEmptyString);
    check(email, Match.Optional(String));

    if (userId != Meteor.userId())
      // Only the owner can request a verification email
      throw new Meteor.Error("not-authorized", "You can only request verification emails for your own email addresses");

    // check for the user having requested too many emails in too short a time
    var document_id = Meteor.call('get_actions_log');

    var db_document = ActionsLog.findOne({_id: document_id}, {fields: { verification_email_sent: 1, locked: 1 }} );

    var event_log = db_document.verification_email_sent;

    if (db_document.locked)
      throw new Meteor.Error("account-locked", "Your account has been locked, please contact an administrator");
    
    var number_of_entries = event_log.length;
    var time_since_last_action = moment().valueOf() - event_log[0];
    
    // try to detect automated email send
    // If the last 5 actions in a space of 1 second
    var last_5_actions_in = event_log[0] - event_log[4];
    if (last_5_actions_in < 2000)
    {
      // Don't allow another attempt for 5 minutes
      if (time_since_last_action < (60 * 1000 * 5))
        throw new Meteor.Error("too-many-requests", "Please wait 5 mins before retrying");

      // it's been at least 5 mins so consider allowing another email
      else
      {
        var last_10_actions_in = event_log[0] - event_log[9];
        if (last_10_actions_in < (60 * 1000 * 5))
        {
          // if the last 10 actions in 5 minutes 4 seconds, wait 30 minutes
          // this looks like an automatic process that has tried continually
          if (time_since_last_action < (60 * 1000 * 30 + 4000))
            throw new Meteor.Error("too-many-requests", "Please wait 30 mins before retrying");
        }
      }
    }

    // try to prevent sending too many emails if the user hits the button repeatedly
    // If the last 3 actions in a space of 1 minute, wait 5 minutes
    var last_3_actions_in = event_log[0] - event_log[2];
    if (last_3_actions_in < 60000)
    {
      // Don't allow another attempt for 5 minutes
      if (time_since_last_action < (60 * 1000 * 5))
        throw new Meteor.Error("too-many-requests", "Please wait 5 mins before retrying");
    }

    // Lock the user's account if 20 emails requested in 30 minutes
    var last_20_actions_in = event_log[0] - event_log[29];
    if (last_20_actions_in < 60 * 1000 * 30)
    {
      ActionsLog.update( {_id: document_id}, { locked: true } );
      throw new Meteor.Error("account-locked", "Your account has been locked, please contact an administrator");
    }

    // send the email
    // record the action in the log
    ActionsLog.update( {_id: document_id}, { $push: { verification_email_sent: {
      $each: [moment().valueOf()],
      $position: 0 
    }}} );

    // remove the oldest log entry if too many stored
    if (number_of_entries > Meteor.settings.private.verification_emails_num_to_log)
        ActionsLog.update( {_id: document_id}, { $pop: { verification_email_sent: 1 }} );

    if (typeof email !== "string")
      Accounts.sendVerificationEmail(Meteor.userId(), email);

    else
      Accounts.sendVerificationEmail(Meteor.userId());
  },
  // make sure the user has the correct role depending on whether their email address is verified
  update_user_roles(id)
  {
    check(id, String);

    if (Meteor.users.find({_id: id}).count() == 0)
      throw new Meteor.Error("not-found", "User width id " + id + "not found");
    var user = Meteor.users.findOne({_id: id});

    try {
      if (user.emails[0].verified)
      {
        Roles.addUsersToRoles(id, ['verified'], 'users');
      }
      else
      {
        Roles.removeUsersFromRoles(id, ['verified'], 'users');
      }
    }
    catch(err) {

    }
  },
  // return the action log for the current user
  // add a blank if none exists
  get_actions_log()
  {
    if (ActionsLog.find( {user_id: Meteor.userId()} ).count() == 0)
      return ActionsLog.insert({
        user_id: Meteor.userId(),
        username: Meteor.user().username,
        verification_email_sent: [],
        image_uploaded: [],
        image_removed: []
      });
    
    else
      return ActionsLog.findOne( {user_id: Meteor.userId()} )._id;
  },
  
  ///////////////////////////////
  // IMPORTANT!! Only works if "debug"
  // Meteor.call("debug_validate_email", Meteor.userId(), true)
  debug_validate_email(user_id, validated)
  {
    if (!Meteor.settings.private.debug)
      return;

    var emails = Meteor.users.findOne({ _id: user_id}).emails;
    emails[0]["verified"] = validated;
    var update = {};
    update["emails"] = emails;
    Meteor.users.update({_id: user_id}, {$set: update});
  }
});
