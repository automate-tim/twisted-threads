UI.registerHelper('tablet_indexes', function() {
  return current_tablet_indexes.list();
});

UI.registerHelper('row_indexes', function() {
  return current_row_indexes.list();
});

UI.registerHelper('weaving_row', function(row) {

  if (typeof current_weaving_cells !== "undefined")
   // can happen if you just added a row
    if (typeof current_weaving_cells.list()[row-1] !== "undefined")
      return current_weaving_cells.list()[row-1].list();
});

//////////////////////////
// Tablets
UI.registerHelper('hole_indexes', function() {
  return [4,3,2,1]; // row 1 at bottom of page
});

UI.registerHelper('threading_hole', function(hole) {
  if (typeof current_threading_cells !== "undefined")
      if (typeof current_threading_cells.list()[hole-1] !== "undefined")
        return current_threading_cells.list()[hole-1].list(); 
});

UI.registerHelper('hole_label', function(hole) {
    var pattern_id = Router.current().params._id;

    // holes are numbered 1, 2, 3, 4
    var labels = ["A", "B", "C", "D"];
    return labels[hole-1];
});

///////////////////////////
  // Helpers for styles
  UI.registerHelper('style_orientation', function(orientation) {
    if (orientation == "Z")
        return "orientation_z";

    else
        return "orientation_s";
  });

  UI.registerHelper('is_selected_style', function() {
    if (Session.equals('selected_style', this.style))
        return "selected";
  });

  UI.registerHelper('cell_style', function(row, tablet) {
    var style = current_styles.list()[this.style-1];
    if (typeof style === "undefined")
          return;

    // remember to update this if style defs change
    // could use a clone but it's cleaner to control the properties directly
    var cell_style = {
      background_color: style.background_color,
      backward_stroke: style.backward_stroke,
      forward_stroke: style.forward_stroke,
      line_color: style.line_color,
      style: style.style
    }

    if (typeof this.row !== "undefined")
      cell_style.row =  this.row;

    if (typeof this.tablet !== "undefined")
      cell_style.tablet = this.tablet;

    if (typeof this.hole !== "undefined")
      cell_style.hole = this.hole;

    return cell_style;
  });

