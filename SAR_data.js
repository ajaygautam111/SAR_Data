//Revised working codes for extracting soil moisture variables for NASASMAP

// STEP 1: Import and visualize study area polygon
var roi = ee.FeatureCollection('users/iofajayhere/Wholeplot');

var roiStyled = roi.style({
  color: 'red',
  fillColor: '00000000',
  width: 2
});
Map.addLayer(roiStyled, {}, 'Study area (outlined)');
Map.centerObject(roi);

// STEP 2: Import SMAP L4 Global Soil Moisture dataset (SPL4SMGP/008)
var smap_l4 = ee.ImageCollection('NASA/SMAP/SPL4SMGP/008');

// STEP 3: Define study period (2024) and selecting only soil variables out of 37 variables
var start = ee.Date('2024-01-01');
var end = ee.Date('2025-01-01'); 

// Get all band names dynamically from the first image
var allBands = smap_l4.first().bandNames();
print('All bands:', allBands);

var variables = [
  'date',
  'sm_surface',
  'sm_rootzone',
  'sm_profile',
  'sm_surface_wetness',
  'sm_rootzone_wetness',
  'sm_profile_wetness'
];

// Filter dataset to the study period and select soil variables (excluding 'date')
var smap_filtered = smap_l4.filterDate(start, end).select(variables.slice(1));

// Generate list of days in the period
var days = end.difference(start, 'day');
var dateList = ee.List.sequence(0, days.subtract(1)).map(function(d) {
  return start.advance(d, 'day');
});

// Create daily average images from 3-hourly data
var dailyIC = ee.ImageCollection(dateList.map(function(date) {
  var d = ee.Date(date);
  var next = d.advance(1, 'day');
  return smap_filtered.filterDate(d, next).mean()
    .set('date', d.format('dd/MM/YYYY'))
    .set('system:time_start', d.millis());
}));

// STEP 4: Use native pixel value at Wholeplot centroid
var centroid = roi.geometry().centroid();
var proj = smap_filtered.first().projection();
var scale = proj.nominalScale();

var dailyFeatures = dailyIC.map(function(img) {
  var valueDict = img.reduceRegion({
    reducer: ee.Reducer.first(),
    geometry: centroid,
    scale: scale,
    crs: proj,
    maxPixels: 1e13
  });
  
  valueDict = ee.Dictionary(valueDict).map(function(key, val) {
    return ee.Algorithms.If(val, ee.Number(val).format('%.2f'), null);
  });
  valueDict = valueDict.set('date', img.get('date'));
  return ee.Feature(null, valueDict);
});

print('Preview of daily native pixel soil variable values:', dailyFeatures.limit(5));

// STEP 5: Export daily soil variable values to CSV in Google Drive
Export.table.toDrive({
  collection: dailyFeatures,
  description: 'SMAP_L4_Daily_SoilVars_2024_NativePixel_1',
  fileFormat: 'CSV',
  selectors: variables,
  folder: 'PHD'
});

