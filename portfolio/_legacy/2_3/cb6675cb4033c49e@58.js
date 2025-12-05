// https://observablehq.com/@ronzor/common@58
import define1 from "./e93997d5089d7165@2246.js";

export default function define(runtime, observer) {
  const main = runtime.module();
  main.variable(observer()).define(["md"], function(md){return(
md`# Common

This notebook is just a collection of methods that I use frequently.`
)});
  main.variable(observer("d3")).define("d3", ["require"], function(require){return(
require("d3@5")
)});
  main.variable(observer("make_svg_path_from_data")).define("make_svg_path_from_data", function(){return(
function make_svg_path_from_data(xt, yt, X, Y) {
  //Inputs:
  //    xt,yt are arrays of the same size containing data for the horizontal and vertical axes respectively.
  //    X,Y are d3.linearScale objects that map our coordinates to the target SVG's coordinates.
  
  // Function returns a string containing an SVG path.
  var path_d = 'M' + X(xt[0]) + ',' + Y(yt[0]);
  for (var i = 1; i < xt.length; i++) {
    path_d = path_d + ' L' + X(xt[i]) + ',' + Y(yt[i]);
  }
  return (path_d)
}
)});
  const child1 = runtime.module(define1);
  main.import("slider", child1);
  main.import("text", child1);
  main.variable(observer("mod")).define("mod", function(){return(
function mod(x, n) {
  return (x % n + n) % n;
}
)});
  main.variable(observer("MakeStandardAxes")).define("MakeStandardAxes", ["d3","DOM"], function(d3,DOM){return(
function MakeStandardAxes(xMin,xMax,xPlace,yMin,yMax,yPlace,height,width,margin, nTicks) {
  const w = width - margin.right - margin.left;
  const h = height - margin.top - margin.bottom;
  const x = d3.scaleLinear().domain([xMin,xMax]).range([0,w]);
  const y = d3.scaleLinear().domain([yMin,yMax]).range([h,0]);
  if (nTicks == -1) {
    nTicks = 0;
  }
  let svg = d3.select(DOM.svg(width, height))
    .append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  switch (xPlace) {
    case "top":
      svg.append("g")
        .call(d3.axisTop(x).ticks(nTicks));
      break;
    case "middle":
      svg.append("g")
        .attr("transform", "translate(0," + h/2 + ")")
        .call(d3.axisBottom(x).ticks(nTicks));
      break;
      case "bottom":
      svg.append("g")
        .attr("transform", "translate(0," + h + ")")
        .call(d3.axisBottom(x).ticks(nTicks));
    default:
      // No x-axis.
  }
  
  switch (yPlace) {
    case "right":
      svg.append("g")
        .attr("transform", "translate(" + w + ",0)")
        .call(d3.axisRight(y).ticks(nTicks));
      break;
    case "middle":
      svg.append("g")
        .attr("transform", "translate(" + w/2 + ",0)")
        .call(d3.axisLeft(y).ticks(nTicks));
      break;
      case "left":
      svg.append("g")
        .call(d3.axisLeft(y).ticks(nTicks));
    default:
      // No y-axis
  }
  
  return [svg,x,y];
}
)});
  main.variable(observer("addCircle")).define("addCircle", function(){return(
function addCircle(svg,x,y,r,stroke,fill) {
  svg.append("circle")
    //.attr("id", "lastCircle")
    .attr("cx",x)
    .attr("cy",y)
    .attr("r", r)
    .attr("stroke", stroke)
    .attr("fill", fill);
}
)});
  main.variable(observer("addArrow")).define("addArrow", function(){return(
function addArrow(svg,x1,y1,x2,y2,color,thickness) {
  // https://stackoverflow.com/questions/36579339/how-to-draw-line-with-arrow-using-d3-js
  svg.append("svg:defs").append("svg:marker")
    .attr("id", "triangle")
    //.attr("refX", 6)
    //.attr("refY", 6)
    .attr("refX", 3)
    .attr("refY", 3)
    .attr("markerWidth", 30)
    .attr("markerHeight", 30)
    .attr("orient", "auto")
    .append("path")
    //.attr("d", "M 0 0 12 6 0 12 3 6")
    .attr("d", "M 0 0 6 3 0 6 1.5 3")
    .style("fill", color);

  svg.append("line")
    .attr("x1", x1)
    .attr("y1", y1)
    .attr("x2", x2)
    .attr("y2", y2)          
    .attr("stroke-width", thickness)
    .attr("stroke", color)
    //.attr("marker-end", "url(#triangle)");  // This created problems in e.g. Safari.
    // Note2Self - add more comments about this one once you've figured out a bit more. [_]
    .attr("marker-end", `url(${window.location.href}#triangle)`);  return svg;
}
)});
  return main;
}
