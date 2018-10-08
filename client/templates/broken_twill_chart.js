

UI.registerHelper('broken_twill_row_indexes', function() {
  // row 1 is at bottom of chart
  var broken_twill_row_indexes = [];
  //for (var i=1; i<=Session.get("number_of_rows") / 2; i++)
  for (var i=Session.get("number_of_rows") / 2; i>=1; i--)
  {
    broken_twill_row_indexes.push(i);
  }
  return broken_twill_row_indexes;
});

UI.registerHelper('broken_twill_data', function(row, tablet) {
	var data = {
		tablet: tablet,
		row: row,
		long_float: this.long_float
	}
  //console.log('*****');
  //console.log(`row ${row}`);
  //console.log(`tablet ${tablet}`);

	// background or foreground colour?
	var twill_cell = current_twill_pattern_chart[(row) + "_" + (tablet)];
  if (typeof twill_cell === "undefined")
  {
    return;
  }

  var value = twill_cell.get();
  //console.log(`value ${value}`);

  if (value == ".") {
  	data.style = 2;
  } else {
  	data.style = 1;
  }

  // twill reversal?
  var twill_reversal_cell = current_twill_reversal_chart[(row) + "_" + (tablet)];
  if (typeof twill_reversal_cell === "undefined")
  {
    return;
  }

  value = twill_reversal_cell.get();

  if (value == ".") {
  	data.twill_reversal = false;
  } else {
  	data.twill_reversal = true;
  }
  // console.log(`twill reversal: ${value}`);

  // get cell background colour
  var style = current_styles.list()[data.style-1];
  data.background_color = style.background_color;

	return data;
});