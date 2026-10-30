/*!
 * josie-hat-season.js — picks Josie's hat for the user's LOCAL date, the way cowboys switch hats.
 *   Straw season: Memorial Day (last Monday of May) through Labor Day (first Monday of September), inclusive.
 *   Felt season:  the day after Labor Day through the day before Memorial Day.
 * Dates are computed for each year, so nothing needs updating annually.
 *
 *   getJosieHatSeason(date?)                 -> 'felt' | 'straw'   (date defaults to now, local time zone)
 *   resolveJosieHat(override?, date?)        -> 'felt' | 'straw'   (override: 'auto' | 'felt' | 'straw')
 *   josieHatSeasonBounds(year)               -> { memorialDay: Date, laborDay: Date }
 * Works as a plain <script> (window.*), CommonJS (require) or bundled ES import via module.exports.
 */
(function (root) {
  'use strict';
  // last Monday of May (local midnight)
  function memorialDay(year) { var d = new Date(year, 4, 31); d.setDate(31 - ((d.getDay() + 6) % 7)); return d; }
  // first Monday of September (local midnight)
  function laborDay(year) { var d = new Date(year, 8, 1); d.setDate(1 + ((8 - d.getDay()) % 7)); return d; }
  function josieHatSeasonBounds(year) { return { memorialDay: memorialDay(year), laborDay: laborDay(year) }; }

  function getJosieHatSeason(date) {
    var d = date ? new Date(date) : new Date();
    if (isNaN(d)) d = new Date();
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate()); // user's local calendar date
    var b = josieHatSeasonBounds(day.getFullYear());
    return (day >= b.memorialDay && day <= b.laborDay) ? 'straw' : 'felt';
  }

  function resolveJosieHat(override, date) {
    var o = String(override || 'auto').toLowerCase();
    return (o === 'felt' || o === 'straw') ? o : getJosieHatSeason(date);
  }

  var api = { getJosieHatSeason: getJosieHatSeason, resolveJosieHat: resolveJosieHat, josieHatSeasonBounds: josieHatSeasonBounds };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.getJosieHatSeason = getJosieHatSeason; root.resolveJosieHat = resolveJosieHat; root.josieHatSeasonBounds = josieHatSeasonBounds; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
