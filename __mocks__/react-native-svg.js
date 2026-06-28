// Manual mock for react-native-svg — used automatically by jest for all tests.
// Plain CommonJS (no TypeScript) to avoid babel-plugin-jest-hoist parse issues.
var React = require('react')
var RN = require('react-native')
var View = RN.View

function stub(props) {
  return React.createElement(View, null, props && props.children != null ? props.children : null)
}

module.exports = {
  __esModule: true,
  default: stub,
  Svg: stub,
  Path: stub,
  Circle: stub,
  Ellipse: stub,
  Rect: stub,
  Line: stub,
  Defs: stub,
  LinearGradient: stub,
  Stop: stub,
  G: stub,
  ClipPath: stub,
  Mask: stub,
  Text: stub,
  TSpan: stub,
  Use: stub,
  Image: stub,
  Symbol: stub,
  Polygon: stub,
  Polyline: stub,
  ForeignObject: stub,
  Marker: stub,
  Pattern: stub,
  RadialGradient: stub,
}
