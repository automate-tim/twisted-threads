/////////////////////////////
// Users collection

this.Users = new Meteor.Pagination(Meteor.users, {
  itemTemplate: "user_thumbnail",
  templateName: "users",
  perPage: 12,
  availableSettings: {
    filters: true,
    sort: true
  },
  auth: function(skip, sub){
    var userSettings = this.userSettings[sub._session.id] || {};
    var userFilters = userSettings.filters || {};

    // all public patterns
    var my_patterns = Patterns.find({
      private: {$ne: true}
    }).map(function(pattern) {return pattern.created_by});


    var _filters = _.extend(
        { $or: [{_id: {$in:my_patterns}}, {_id: sub.userId}]}, userFilters); // Only return users with published patterns, and the user themself

    var _options = {
      limit: 12,
      skip: skip
    }
    if (typeof userSettings.sort === "object") /* if client-side sort */
      _options.sort = userSettings.sort;
    else
    {
      _options.sort = { 'profile.name_sort': 1}; // lower-case version of username
    }
    
    return [_filters, _options];
  }
});

/////////////////////////////
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

////////////////////////////
// Pagination
// https://github.com/alethes/meteor-pages
this.AllPatterns = new Meteor.Pagination(Patterns, {
  itemTemplate: "pattern_thumbnail",
  templateName: "all_patterns",
  perPage: 12, /* required, otherwise pages do not show consistent number of documents */
  availableSettings: {
    filters: true,
    sort: true
  },
  auth: function(skip, sub){
    var userSettings = this.userSettings[sub._session.id] || {};
    var userFilters = userSettings.filters || {}; /* apply client-side filters if set */
    var _filters = _.extend({ /* whatever you allow here is allowed everywhere - including by your own publish functions */
      $or: [
        { private: {$ne: true} },
        { created_by: sub.userId }
      ]
    }, userFilters);

    var _options = {
      limit: 12, /* replaces perPage */
      skip: skip /* skip is required, otherwise pages > 1 show nothing */
    }
    if (typeof userSettings.sort === "object") /* if client-side sort */
      _options.sort = userSettings.sort;
    else
      _options.sort = { name_sort: 1};
    
    return [_filters, _options];
  },
  filters: {}
});

this.NewPatterns = new Meteor.Pagination(Patterns, {
  itemTemplate: "pattern_thumbnail",
  templateName: "new_patterns",
  perPage: 12,
  availableSettings: {
    filters: true
  },
  auth: function(skip, sub){
    var userSettings = this.userSettings[sub._session.id] || {};
    var userFilters = userSettings.filters || {};
    var _filters = _.extend({
      $or: [
        { private: {$ne: true} },
        { created_by: sub.userId }
      ]
    }, userFilters);

    var _options = {
      limit: 12,
      sort: { created_at: -1},
      skip: skip
    }
    
    return [_filters, _options];
  },
  filters: {}
});

this.MyPatterns = new Meteor.Pagination(Patterns, {
  itemTemplate: "pattern_thumbnail",
  templateName: "my_patterns",
  perPage: 12,
  availableSettings: {
    filters: true,
    sort: true
  },
  auth: function(skip, sub){
    var userSettings = this.userSettings[sub._session.id] || {};
    var userFilters = userSettings.filters || {};
    var _filters = _.extend({created_by: sub.userId}, userFilters);

    var _options = {
      limit: 12,
      sort: { name_sort: 1},
      skip: skip
    }
    
    return [_filters, _options];
  }
});

// show all patterns belonging to one user
this.UserPatterns = new Meteor.Pagination(Patterns, {
  itemTemplate: "pattern_thumbnail",
  templateName: "user",
  perPage: 12,
  availableSettings: {
    filters: true,
    sort: true
  },
  auth: function(skip, sub){
    var userSettings = this.userSettings[sub._session.id] || {};
    var userFilters = userSettings.filters || {};
    var _filters = _.extend({
      $or: [
        { private: {$ne: true} },
        { created_by: sub.userId }
      ]
    }, userFilters);

    var _options = {
      limit: 12,
      sort: { name_sort: 1},
      skip: skip
    }
    
    return [_filters, _options];
  }
});
