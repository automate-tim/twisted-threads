Patterns = new Meteor.Collection('patterns');

// https://github.com/alethes/meteor-pages
this.AllPatterns = new Meteor.Pagination(Patterns, {
  itemTemplate: "pattern_thumbnail",
  templateName: "all_patterns",
  perPage: 12,
  sort: {
    name: 1
  }
});

this.NewPatterns = new Meteor.Pagination(Patterns, {
  itemTemplate: "pattern_thumbnail",
  templateName: "new_patterns",
  perPage: 12,
  sort: {
    created_at: -1
  }
});

this.MyPatterns = new Meteor.Pagination(Patterns, {
  itemTemplate: "pattern_thumbnail",
  templateName: "my_patterns",
  perPage: 12,
  sort: {
    name: 1
  },
  auth: function(skip, sub){
    var _filters = {created_by: sub.userId};
    var _options = {sort: {name: 1}};
    return [_filters, _options];
    //return Patterns.find({created_by: sub.userId}); // this ought to work but doesn't
  }
});

this.RecentPatterns = new Meteor.Pagination(Patterns, {
  itemTemplate: "pattern_thumbnail",
  templateName: "recent_patterns",
  perPage: 12,
  sort: {
    name: 1
  },
  availableSettings: {
    filters: true,
    settings: true,
    sort: true
  },
  filters: {}
});

// tags on patterns
Tags.TagsMixin(Patterns); // https://atmospherejs.com/patrickleet/tags
Patterns.allowTags(function (userId) { return true; });

// search patterns
patternsIndex = new EasySearch.Index({
  collection: Patterns,
  fields: ['name', 'tags', 'created_by_username', 'number_of_tablets'],
  defaultSearchOptions: {
    limit: 6
  },
  engine: new EasySearch.Minimongo() // search only on the client, so only published documents are returned
  /*engine: new EasySearch.MongoDB({
    selector: function (searchObject, options, aggregation) {
      let selector = this.defaultConfiguration().selector(searchObject, options, aggregation);

      selector.createdBy = options.userId;
      console.log("searchObject " + Object.keys(searchObject));
      console.log("aggregation " + Object.keys(aggregation));
      console.log("id " + options.userId);

      return selector;
    }
  })*/
});

usersIndex = new EasySearch.Index({
  collection: Meteor.users,
  fields: ['username', 'profile.description'],
  defaultSearchOptions: {
    limit: 6
  },
  engine: new EasySearch.Minimongo() // search only on the client, so only published documents are returned
});


Recent_Patterns = new Mongo.Collection('recent_patterns'); // records the patterns each user has viewed / woven recently

// Polyfill in case indexOf not supported, not that we are necessarily expecting to support IE8-
// https://gist.github.com/revolunet/1908355
// Just being careful
if (!Array.prototype.indexOf)
{
  Array.prototype.indexOf = function(elt /*, from*/)
  {
    var len = this.length >>> 0;
    var from = Number(arguments[1]) || 0;
    from = (from < 0)
         ? Math.ceil(from)
         : Math.floor(from);
    if (from < 0)
      from += len;

    for (; from < len; from++)
    {
      if (from in this &&
          this[from] === elt)
        return from;
    }
    return -1;
  };
}

////////////////////////
// extends 'check' functionality
// check(userId, NonEmptyString);
NonEmptyString = Match.Where(function (x) {
  check(x, String);
  return x.length > 0;
});

// general parameters
Meteor.my_params = {}; // namespace for parameters
Meteor.my_params.undo_stack_length = 10;
Meteor.my_params.special_styles_number = 16; // currently up to 16 special styles allowing 3 multiple turns and 4 other single styles
Meteor.my_params.pattern_thumbnail_width = 248; // tiled pattern thumbnails
Meteor.my_params.pattern_thumbnail_rmargin = 16; // right margin

default_special_styles = [
{
  "background_color": "#FFFFFF",
  "image": "/images/special_forward_2.svg"
},
{
  "background_color": "#FFFFFF",
  "image": "/images/special_backward_2.svg"
},
{
  "background_color": "#FFFFFF",
  "image": "/images/special_forward_3.svg"
},
{
  "background_color": "#FFFFFF",
  "image": "/images/special_backward_3.svg"
},
{
  "background_color": "#FFFFFF",
  "image": "/images/special_forward_4.svg"
},
{
  "background_color": "#FFFFFF",
  "image": "/images/special_backward_4.svg"
},
{
  "background_color": "#FFFFFF",
  "image": "/images/special_empty.svg"
},
{
  "background_color": "#FFFFFF",
  "image": ""
},
{
  "background_color": "#BBBBBB",
  "image": "/images/special_backward_2.svg"
},
{
  "background_color": "#BBBBBB",
  "image": "/images/special_forward_2.svg"
},
{
  "background_color": "#BBBBBB",
  "image": "/images/special_backward_3.svg"
},
{
  "background_color": "#BBBBBB",
  "image": "/images/special_forward_3.svg"
},
{
  "background_color": "#BBBBBB",
  "image": "/images/special_backward_4.svg"
},
{
  "background_color": "#BBBBBB",
  "image": "/images/special_forward_4.svg"
},
{
  "background_color": "#FFFFFF",
  "image": "/images/special_backward_strike.svg"
},
{
  "background_color": "#FFFFFF",
  "image": "/images/special_forward_strike.svg"
}
];

if (Meteor.isClient) {
  // configure the default accounts-ui package
  
  Accounts.ui.config({
    passwordSignupFields: "USERNAME_AND_EMAIL"
  });
  
  Session.set('window_width', $(window).width());
  Session.set('window_height', $(window).height());

  Meteor.startup(function () {

    Session.set('click_latch', false); // used to prevent double click on buttons

    Session.set("loading", false);

    window.addEventListener('resize', function(){
      Session.set('window_width', $(window).width());
      Session.set('window_height', $(window).height());
      Session.set('patterns_in_row', Meteor.my_functions.patterns_in_row());
    });
  });

  reactive_recent_patterns = new ReactiveArray();

  //////////////////////////////
  // Helpers for templates that may be used on multiple pages

  /* *** Loading template *** */
  Template.loading.rendered = function() {
    $('body').attr("class", "loading");
    Meteor.my_functions.initialize_route();
  }

  Template.main_layout.rendered = function() {
    // main template contains the header and width divs
     $(window).on('resize orientationchange', function(e) {
      Meteor.my_functions.resize_page();  
    });

     $("#width").on('scroll', function(e) {
      Meteor.my_functions.resize_page();  
    }); 
   }

  Template.main_layout.helpers({
    loading: function(){
      if (Session.equals('loading', true))
        return true;
    }
  });

  /* *** Helper functions that may be used by more than one template *** */
  // Allows a template to check whether a helper value equals a string
  UI.registerHelper('signed_in', function () {
    if (Meteor.userId())
      return "signed_in";
  });

  UI.registerHelper('equals', function (a, b) {
    return a === b;
  });

  // used by connection_status template and also to apply class to div#width
  UI.registerHelper('connection_status', function () {
    /* meteor.status().status can have these values:
      connected
      connecting (disconnnected, trying to connect)
      failed (permainently failed e.g. incompatible)
      waiting (will try to reconnect)
      offline (user disconnected the connection)
    */

    // there is a 3 second delay before reporting connection lost, partly to avoid a false 'connection lost' message when the page is first loaded.

    switch (Meteor.status().status)
    {
      case "connecting":  // Fallthrough
      case "waiting":
        if (typeof connection_timeout === "undefined")
          connection_timeout = setTimeout(function(){
            Session.set("connection_status", "trying_to_connect");
          }, 3000);
        break;

      case "failed":  // Fallthrough
      case "offline":
        if (typeof disconnected_timeout === "undefined")
          disconnected_timeout = setTimeout(function(){
            Session.set("connection_status", "disconnected");
          }, 3000);
        Session.set("connection_status", "disconnected");
        break;

      case "connected":
        Session.set("connected", true);
        if (typeof connection_timeout !== "undefined")
          clearTimeout(connection_timeout);

        if (typeof disconnected_timeout !== "undefined")
          clearTimeout(disconnected_timeout);

        Session.set("connection_status", "connected");
        break;

      default:
        Session.set("connection_status", "disconnected");
        break;
    }
    return Session.get("connection_status");
  });

  //////////////////////////////////
  // Used in header to display correct buttons and title depending on route and params
  // Used in menu to determine menu entries
  UI.registerHelper('route_name', function(){
    return Router.current().route.getName();
  });

  //////////////////////////////////
  // provide lists of patterns in different categories
  UI.registerHelper('recent_patterns', function(limit){
    if (Meteor.userId()) // user is signed in
      var pattern_ids = Recent_Patterns.find({}, {sort: {accessed_at: -1}}).map(function(pattern){ return pattern.pattern_id});

    else
      var pattern_ids = Meteor.my_functions.get_local_recent_pattern_ids();

    // stored for "recent patterns" route pagination
    reactive_recent_patterns.clear();
    reactive_recent_patterns = new ReactiveArray(pattern_ids);

    RecentPatterns.set({
      filters: {
          _id: {
            $in: reactive_recent_patterns.array()
          }
        }
    });

    // return the patterns in recency order
    var patterns = [];
    //var max_number = Meteor.my_functions.number_of_pattern_thumbs();
    //console.log("recents max_number " + Session.get('patterns_in_row'));
    for (var i=0; i<pattern_ids.length; i++)
    {
      var id = pattern_ids[i];
      // Check for null id or non-existent pattern
      if (id == null) continue;
      if (typeof id === "undefined") continue;
      
      var pattern = Patterns.findOne({_id: id});
      if (typeof pattern === "undefined") continue;

      if (limit)
        if (i >= Session.get('patterns_in_row'))
          break;
      
      patterns.push(pattern);
    }

    return patterns; // Note this is an array because order is important, so in the template use .length to find number of items, not .count
  });

  UI.registerHelper('not_recent_patterns', function(limit){
    // any visible pattern that is not shown in Recent Patterns
    if (Meteor.userId()) // user is signed in
      var pattern_ids = Recent_Patterns.find().map(function(pattern){ return pattern.pattern_id});

    else
      var pattern_ids = Meteor.my_functions.get_local_recent_pattern_ids();

    var obj = {};     
    obj["sort"] = {};
    obj["sort"]["name"] = 1;

    if (limit)
      obj["limit"] = Session.get('patterns_in_row');
      
    return Patterns.find({_id: {$nin: pattern_ids}}, obj);
    // This is a cursor use use .count in template to find number of items
  });

  UI.registerHelper('my_patterns', function(limit){
    if (!Meteor.userId())
      return;

    var obj = {};
      
    obj["sort"] = {};
    obj["sort"]["name"] = 1;

    if (limit)
      obj["limit"] = Session.get('patterns_in_row');

    return Patterns.find({created_by: Meteor.userId()}, obj);
    // This is a cursor use use .count in template to find number of items
  });

  UI.registerHelper('new_patterns', function(limit){
    var obj = {};
    obj["sort"] = {};
    obj["sort"]["created_at"] = -1;

    if (limit)
      obj["limit"] = Session.get('patterns_in_row');

    return Patterns.find({}, obj);
    // This is a cursor use use .count in template to find number of items
  });

  UI.registerHelper('all_patterns', function(limit){
    //console.log("all " + limit);
    var obj = {};
    obj["sort"] = {};
    obj["sort"]["created_at"] = -1;

    if (limit)
      obj["limit"] = Session.get('patterns_in_row');

    return Patterns.find({}, obj);
    // This is a cursor use use .count in template to find number of items
  });

  Template.left_column.helpers({
    selected: function(item) {
      var route = Router.current().route.getName();
      switch(item)
      {
        case "home":
        case "recent_patterns":
        case "new_patterns":
        case "my_patterns":
        case "all_patterns":
          if (route == item)
            return "selected";
          break;
      }
    }
  });

  ////////////////////////////////////
  Template.header.onCreated(function() {
    this.subscribe('patterns', {
        onReady: function () { 
          console.log("Patterns ready. Patterns count " + Patterns.find().count());
          Session.set('patterns_ready', true);
        }
      });
    this.subscribe('weaving'); // TODO remove
    this.subscribe('recent_patterns', {
      onReady: function() {
        Session.set('recents_ready', true);
      }
    });
  });

  Template.header.events({
    // The router doesn't show the 'loading' template for these actions because only the data changes, not the route. So here we manually trigger a simple "Loading..." display to help the user when switching between view pattern and weave.
    'click #start_weaving': function(){
      Session.set("loading", true);
    },
    'click #stop_weaving': function(){
      Session.set("loading", true);
    }
  });

  Template.search.helpers({
    indexes: function () {
      return [patternsIndex, usersIndex];
    },
    patternsIndex: function () {
      return patternsIndex;
    },
    usersIndex: function () {
      return usersIndex;
    },
    attributes: function () {
      if (Session.get('window_width') > 650)
        return { 'class': 'easy-search-input', 'placeholder': 'Search for patterns...' };

      else if (Session.get('window_width') < 460)
        return { 'class': 'easy-search-input', 'placeholder': '' };

      else
        return { 'class': 'easy-search-input', 'placeholder': 'Search...' };
    },
    search_term: function() {
      //return $('input.easy-search-input').val();
      return patternsIndex.getComponentDict().get('searchDefinition');
    },
    css_class: function() {
      if (Session.get('window_width') > 650)
        return "wide";

      else if (Session.get('window_width') < 460)
        return "narrow";
    },
    is_searching: function() {
      if (patternsIndex.getComponentMethods().isSearching() && usersIndex.getComponentMethods().isSearching())
        return true;
    },
    no_results: function() {
      if (patternsIndex.getComponentMethods().hasNoResults() && usersIndex.getComponentMethods().hasNoResults())
        return true;
    },
    more_documents: function() {
      if (patternsIndex.getComponentMethods().hasMoreDocuments() || usersIndex.getComponentMethods().hasMoreDocuments())
        return true;
    }
  });

  Template.search.onRendered(function () {
    $('body').on("click", function(event){
      // close the results list if the user clicks outside it

      // if the results list is shown
      if ($('#search .results-wrapper').length != 0)
      {
        // did the user click outside the results list
        var results_list = $('.results-wrapper');

        if (!results_list.is(event.target) // if the target of the click isn't the container...
        && results_list.has(event.target).length === 0) // ... nor a descendant of the container
        {
          // but not in the search input?
          var input = $('#search .input-wrapper input.easy-search-input');

            if (!input.is(event.target)
          && input.has(event.target).length === 0)
          {
            Meteor.my_functions.hide_search_results();
          }
        }
      }
    });

    $(window).on("keyup", function(event) {
      // close the results list if the user presses 'Esc'

      // if the results list is shown
      if ($('#search .results-wrapper').length != 0)
      {
        if (event.which == 27) // user pressed 'Esc'
        Meteor.my_functions.hide_search_results();
      }
    })
  });

  Template.search.onDestroyed(function () {
    $('body').off("click");

    $(window).off("keyup");
  });

  Template.search.events({
    'click li': function () {
      // clear the search when you select a result
      $('input.easy-search-input').val("");
      Meteor.my_functions.hide_search_results();
    },
    'click #load_more': function(event) {
      event.preventDefault();

      if (patternsIndex.getComponentMethods().hasMoreDocuments())
      {
        if (usersIndex.getComponentMethods().hasMoreDocuments())
        {
          // load more docs from both indexes
          usersIndex.getComponentMethods().loadMore(4);
          patternsIndex.getComponentMethods().loadMore(4);
        }
        else
        {
          // load more docs for patternsIndex only
          patternsIndex.getComponentMethods().loadMore(8);
        }
      }
      else if (usersIndex.getComponentMethods().hasMoreDocuments())
      {
        // load more docs for usersIndex only
        usersIndex.getComponentMethods().loadMore(8);
      }

    }
  });

  UI.registerHelper('is_weaving', function(){
    if (Router.current().params.mode=="weaving")
      return true;
  });

  // this checks not only whether user_id is null but also whether the user curently has permission to see this user
  UI.registerHelper('user_exists', function(user_id){
    return (Meteor.users.find({ _id: user_id}).count() != 0);
  });

  UI.registerHelper('pattern_exists', function(pattern_id){
    if (Patterns.find({_id: pattern_id}, {fields: {_id: 1}}, {limit: 1}).count() != 0)
      return true;
  });

  ///////////////////////////////
  // menu

  UI.registerHelper('menu_open', function()
  {
    if (Session.equals('menu_open', true))
      return "open";
  });


  UI.registerHelper('can_edit_pattern', function(pattern_id) {
      return Meteor.my_functions.can_edit_pattern(pattern_id);
  });

  ///////////////////////////////////
  // Menu - options for selected pattern
  Template.menu.helpers({
    show_menu: function(subscriptionsReady, route_name, pattern_id){
      // show the menu if either
      // file loading is supported by the browser and the user is signed in,
      // OR the user is viewing a specific pattern
      // if the user is not signed in, the only available menu option is to view the printer-friendly pattern
      // import, copy and export pattern are only available to signed in users

      if ((Meteor.my_functions.is_file_loading_supported() && Meteor.userId()) || (subscriptionsReady && (route_name == "pattern") && (Patterns.find({ _id: pattern_id}).count() != 0)))
        return true;
    },
    is_file_loading_supported: function()
    {
      if (Meteor.my_functions.is_file_loading_supported())
        return true;

      else
        return false;
    }
  });

  Template.menu.events({
    'click #menu_button': function() {
      if (Session.equals('menu_open', true))
        Session.set('menu_open', false);

      else
        Session.set('menu_open', true);
    },
    'click #menu .menu_list ul li a': function(){
      Session.set('menu_open', false);
    },
    // import a pattern from a JSON file
    'click #import_pattern': function() {
      Session.set('show_import_pattern', true);
    },
    // copy this pattern to a new pattern
    // if route="pattern", the template _id is a pattern_id
    'click #copy_pattern': function(event, template) {
      if (Router.current().route.getName() == "pattern")
      {
        Meteor.my_functions.copy_pattern(template.data._id);
      }
    },
    // display this pattern as JSON
    'click #export_pattern': function() {
      Session.set('show_pattern_as_text', true);
    }
  });

  // Import pattern from file
  // Dialog to choose which type of file to import
  Template.import_pattern_dialog.helpers({
    'show_import_pattern': function() {
      if (Session.equals('show_import_pattern', true))
          return "visible";
    },
    'checked': function(name){
      if (Session.equals('import_file_type', name))
        return "true";
    },
    'disabled': function(){
      if (typeof Session.get('import_file_type') === "undefined")
        return "disabled";
    }
  });

  Template.import_pattern_dialog.events({
    'click #import_pattern_dialog .close': function(event) {
      Session.set('show_import_pattern', false);
    },
    'click #import_pattern_dialog .continue': function(event) {
      $('#file_picker').trigger('click');
      Session.set('show_import_pattern', false);
    },
    'change [name="file_type"]': function(){
      var file_types = document.getElementsByName('file_type');
      var selected_type;
      for(var i = 0; i < file_types.length; i++){
        if(file_types[i].checked){
            selected_type = file_types[i].value;
        }
      }
      Session.set('import_file_type', selected_type);
    }
  });

  // Import a file
  Template.import_file_picker.events({
  'change input#file_picker': function(event) {
    // Check for the various File API support.
    if (Meteor.my_functions.is_file_loading_supported())
    {
      var files = event.target.files; // FileList object
       f = files[0];
       
        var reader = new FileReader();

        // Closure to capture the file information.
        reader.onload = (function(theFile) {
          return function(e) {

            // find the filename so it can be used as a fallback pattern name
            // e.g. GTT files don't always have a name
            var filename = Meteor.my_functions.trim_file_extension(theFile.name);

            // be cautious about uploading large files
            if (theFile.size > 1000000)
              alert("Unable to load a file larger than 1MB");

            switch(Session.get('import_file_type'))
            {
              case "JSON":
                JsonObj = JSON.parse(e.target.result);
                Meteor.my_functions.import_pattern_from_json(JsonObj);
                break;

              case "GTT":
                Meteor.my_functions.import_pattern_from_gtt(e.target.result, filename);
                break;

              default:
                alert("Unrecognised file type, cannot import pattern")
                break;
            }
          };
        })(f);

        // Read in the image file as a data URL.
        reader.readAsText(f);

        // reset the form so that the same file can be loaded twice in succession
        $(event.target).wrap('<form>').closest('form').get(0).reset();
        $(event.target).unwrap();

        // Prevent form submission
        event.stopPropagation();
        event.preventDefault();
      }
    }
  });

  ///////////////////////////////////
  // 'view pattern as text' (e.g. JSON) dialog
  Template.pattern_as_text.helpers({
    'show_pattern_as_text': function() {
      if (Session.equals('show_pattern_as_text', true))
          return "visible";
    },
    'pattern_as_json': function() {
      if (Session.equals('show_pattern_as_text', false))
          return;

      var pattern_id = this._id;
      var pattern_as_text = JSON.stringify(Meteor.my_functions.export_pattern_to_json(pattern_id), null, '\t'); // prettify JSON with tabs

      // make arrays more readable by removing new lines, spaces and tabs within them. But don't alter arrays of objects (styles).
      var original_arrays = [];
      var new_arrays = [];

      var re = /\[[^\][^\}]*?\]/g;
      // find text between [], may contain new lines http://stackoverflow.com/questions/6108555/replace-text-inside-of-square-brackets
      // ignore text containing [] or {}, i.e. nested brackets and objects in arrays
      for(m = re.exec(pattern_as_text); m; m = re.exec(pattern_as_text)){
        original_arrays.push(m[0]);
        var this_array = m[0];

        //this_array = this_array.replace(/ /g,'');// original, works but strips spaces from inside strings such as tags
        /*this_array.replace(/([^"]+)|("(?:[^"\\]|\\.)+")/, function($0, $1, $2) {
            if ($1) {
                return $1.replace(/\s/g, '');
            } else {
                return $2; 
            } 
        });*/ // works but long, from same source as below

        // remove spaces except for those between double quotes
        // http://stackoverflow.com/questions/14540094/javascript-regular-expression-for-removing-all-spaces-except-for-what-between-do
        var regex = /"[^"]+"|( )/g;
        this_array.replace(regex, function(m, group1) {
            if (group1 == "" ) return m;
            else return "";
        });

        this_array = this_array.replace(/\t/g,''); //remove tabs
        this_array = this_array.replace(/(\r\n|\n|\r)/gm,"");
        // line break removal http://www.textfixer.com/tutorials/javascript-line-breaks.php
        new_arrays.push(this_array);
      }
      for(var i = 0; i < original_arrays.length; i++) {
        pattern_as_text = pattern_as_text.split(original_arrays[i]).join(new_arrays[i]);
        // replace text http://stackoverflow.com/questions/5334380/replacing-text-inside-of-curley-braces-javascript
      }
      return pattern_as_text;
    }
  });

  Template.pattern_as_text.events({
    'click #pattern_as_text .close': function() {
      Session.set('show_pattern_as_text', false);
    },
    'click #pattern_as_text .select': function() {
      $('#pattern_as_text textarea').select();
    }
  });

  ///////////////////////////////////
  // reacting to database changes
  Tracker.autorun(function (computation) {
    
    // The publish functions don't automatically update queries to other collections. So the client resubscribes to pattern-related collections whenever the list of patterns that the user can see changes.
    // my_pattern_ids detects that Patterns has changed. Math.random triggers the re-subscription, otherwise Meteor refuses to run it.

    var my_pattern_ids = Patterns.find({}, {fields: {_id: 1}}).map(function(pattern) {return pattern._id});
    if (my_pattern_ids)
    {
      Meteor.subscribe('recent_patterns', Math.random());
    }
    
    if (Session.equals('patterns_ready', true) && Session.equals('recents_ready', true))
      Meteor.my_functions.maintain_recent_patterns(); // clean up the recent patterns list in case any has been changed

    // detect login / logout
    var currentUser=Meteor.user();
    if(currentUser){
      
      if (!Session.equals('was_signed_in', true))
      {
        Session.set('was_signed_in', true);
        setTimeout(function(){ Meteor.my_functions.resize_page();}, 20);
      }
    }
    else if(!computation.firstRun){ // avoid useless logout detection on app startup
      
      if (Session.equals('was_signed_in', true))
      {
        Session.set('was_signed_in', false);
        setTimeout(function(){ Meteor.my_functions.resize_page();}, 20);
      }
    }
  });
}

