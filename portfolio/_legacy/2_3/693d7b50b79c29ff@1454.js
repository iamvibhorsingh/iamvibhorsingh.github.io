// https://observablehq.com/d/693d7b50b79c29ff@1454
import define1 from "./cb6675cb4033c49e@58.js";

export default function define(runtime, observer) {
  const main = runtime.module();
  main.variable(observer()).define(["md"], function(md){return(
md `## Racing Bar chart – the countries that recieve the most donations in the world each year`
)});
  main.variable(observer()).define(["md"], function(md){return(
md `Legend for regions of the world. Refer to map in the visualization for geographical information`
)});
  main.variable(observer()).define(["d3","DOM","legend"], function(d3,DOM,legend)
{
  
  var svg = d3.select(DOM.svg(200, 200));
  svg.append("g")
  .attr("class", "legend legend--ordinal")
  .attr("transform", "translate(20,20)");

  svg.select(".legend")
  .call(legend);

  return svg.node();
}
);
  main.variable(observer("chart")).define("chart", ["d3","DOM","width","height","top_n","haloHighlight","startYear","dataset","halo","world_simplified","projection","topojson","tickDuration","endYear"], function(d3,DOM,width,height,top_n,haloHighlight,startYear,dataset,halo,world_simplified,projection,topojson,tickDuration,endYear)
{
  const svg = d3.select(DOM.svg(width, height));
  
  const margin = {
    top: 80,
    right: 0,
    bottom: 5,
    left: 0
  };
  
  let barPadding = (height-(margin.bottom+margin.top))/(top_n*5);
  
  let title = svg.append('text')
    .attrs({
      class: 'title',
      y: 24
    })
    .html('The countries that recieve largest amount of aid: 1973 to 2013');
  
  haloHighlight(title, 250, 2, 1, '#000000');
  
  let subTitle = svg.append('text')
    .attrs({
      class: 'subTitle',
      y: 55
    })
    .html('Annual Aid recieved (million dollars)');
  
  haloHighlight(subTitle, 1750, 1, 1, '#777777');

  let year = startYear;
  
  dataset.forEach(d => {
    d.value = +d.value,
    d.lastValue = +d.lastValue,
    d.value = isNaN(d.value) ? 0 : d.value,
    d.year = +d.year
  });
  
  let yearSlice = dataset.filter(d => d.year == year && !isNaN(d.value))
    .sort((a,b) => b.value - a.value)
    .slice(0,top_n);
  
  yearSlice.forEach((d,i) => d.rank = i);
  
  let x = d3.scaleLinear()
    .domain([0, d3.max(yearSlice, d => d.value)])
    .range([margin.left, width-margin.right-65]);
  
  let y = d3.scaleLinear()
    .domain([top_n, 0])
    .range([height-margin.bottom, margin.top]);
  
  let groups = dataset.map(d => d.group);
  groups = [...new Set(groups)];
  
  let colourScale = d3.scaleOrdinal()
    .range(["#ce7c2f", "#1285b3", "#C7432B", "#7cce2f", "#eb09be", "#5d9e9b", "#4b0b99"])
    .domain(["South Asia","Europe","Asia","Latin America","Middle East","North America","Africa"]);

  let xAxis = d3.axisTop()
    .scale(x)
    .ticks(width > 500 ? 5:2)
    .tickSize(-(height-margin.top-margin.bottom))
    .tickFormat(d => d3.format(',')(d));
  
  svg.append('g')
    .attrs({
      class: 'axis xAxis',
      transform: `translate(0, ${margin.top})`
    })
    .call(xAxis)
      .selectAll('.tick line')
      .classed('origin', d => d == 0);
  
  svg.selectAll('rect.bar')
    .data(yearSlice, d => d.name)
    .enter()
    .append('rect')
    .attrs({
      class: 'bar',
      x: x(0)+1,
      width: d => x(d.value)-x(0)-1,
      y: d => y(d.rank)+5,
      height: y(1)-y(0)-barPadding
    })
    .styles({
      fill: d => colourScale(d.group)
    });
  
  svg.selectAll('text.label')
    .data(yearSlice, d => d.name)
    .enter()
    .append('text')
    .attrs({
      class: 'label',
      transform: d => `translate(${x(d.value)-10}, ${y(d.rank)+5+((y(1)-y(0))/2)+7})`,
      'text-anchor': 'end'
    })
    .selectAll('tspan')
    .data(d => [{text: d.name, opacity: 1, weight:600}, {text: d.subGroup, opacity: 1, weight:400}])
    .enter()
    .append('tspan')
    .attrs({
      x: 0,
      dy: (d,i) => i*16
    })
    .styles({
      fill: d => d.weight == 400 ? '#444444':'',
      'font-weight': d => d.weight,
      'font-size': d => d.weight == 400 ? '12px':''
    })
    .html(d => d.text);
  
  svg.selectAll('text.valueLabel')
    .data(yearSlice, d => d.name)
    .enter()
    .append('text')
    .attrs({
      class: 'valueLabel',
      x: d => x(d.value)+5,
      y: d => y(d.rank)+5+((y(1)-y(0))/2),
    })
    .text(d => d3.format(',')(d.lastValue));
  
  let credit = svg.append('text')
    .attrs({
      class: 'caption',
      x: width,
      y: height-28
    })
    .styles({
      'text-anchor': 'end'
    })
  
  let sources = svg.append('text')
    .attrs({
      class: 'caption',
      x: width,
      y: height-6
    })
    .styles({
      'text-anchor': 'end'
    })
    .html('Reference: Used bar race animation from https://observablehq.com/@johnburnmurdoch/bar-chart-race')
    .call(halo, 8);
  
  let yearIntro = svg.append('text')
    .attrs({
      class: 'yearIntro',
      x: width-225,
      y: height-195
    })
    .styles({
      'text-anchor': 'end'
    })
    .html('Year: ');
  
  haloHighlight(yearIntro, 1000, 3, 1, '#cccccc');
  
  let yearText = svg.append('text')
    .attrs({
      class: 'yearText',
      x: width-225,
      y: height-195
    })
    .html(~~year);
  
  yearText.call(halo, 10);
  
  haloHighlight(yearText, 3000, 8, 1, '#cccccc');
  
  let regions = world_simplified.objects.ne_10m_admin_0_countries.geometries.map(d => d.properties.REGION_WB);
  regions = [...new Set(regions)];
  
  const path = d3.geoPath()
    .projection(projection);
 
  let mapLegend = svg.append('g')
    .attrs({
      class: 'map-legend',
      transform: `translate(${width-225}, ${height-160})`
    });
  
  mapLegend
    .append('rect')
    .attrs({
      x: 0,
      y: -20,
      width: 224,
      height: 130
    })
    .styles({
      fill: '#ffffff',
      stroke: '#dddddd'
    });
  
  let mapSubtitle = mapLegend
    .append('text')
    .attrs({
      x: 5,
      y: -5
    })
    .html('Bar colours represent regions of the world');

  mapSubtitle.call(halo, 2);
  
  haloHighlight(mapSubtitle, 4500, 1, 1, '#777777');
  
  mapLegend
    .append('path')
    .datum(topojson.merge(world_simplified, world_simplified.objects.ne_10m_admin_0_countries.geometries.filter(d => d.properties.REGION_WB == 'South Asia')))
    .attrs({
      d: path,
      fill: colourScale('South Asia')
    });
  
  mapLegend
    .append('path')
    .datum(topojson.merge(world_simplified, world_simplified.objects.ne_10m_admin_0_countries.geometries.filter(d => d.properties.REGION_WB == 'East Asia & Pacific')))
    .attrs({
      d: path,
      fill: colourScale('Asia')
    });
  
  mapLegend
    .append('path')
    .datum(topojson.merge(world_simplified, world_simplified.objects.ne_10m_admin_0_countries.geometries.filter(d => d.properties.REGION_WB == 'Europe & Central Asia' && d.properties.ADMIN != 'Greenland')))
    .attrs({
      d: path,
      fill: colourScale('Europe')
    });
  
  mapLegend
    .append('path')
    .datum(topojson.merge(world_simplified, world_simplified.objects.ne_10m_admin_0_countries.geometries.filter(d => d.properties.REGION_WB == 'North America')))
    .attrs({
      d: path,
      fill: colourScale('North America')
    });
  
  mapLegend
    .append('path')
    .datum(topojson.merge(world_simplified, world_simplified.objects.ne_10m_admin_0_countries.geometries.filter(d => d.properties.REGION_WB == 'Middle East & North Africa')))
    .attrs({
      d: path,
      fill: colourScale('Middle East')
    });
  
  mapLegend
    .append('path')
    .datum(topojson.merge(world_simplified, world_simplified.objects.ne_10m_admin_0_countries.geometries.filter(d => d.properties.REGION_WB == 'Sub-Saharan Africa')))
    .attrs({
      d: path,
      fill: colourScale('Africa')
    });
  
  mapLegend
    .append('path')
    .datum(topojson.merge(world_simplified, world_simplified.objects.ne_10m_admin_0_countries.geometries.filter(d => d.properties.REGION_WB == 'Latin America & Caribbean')))
    .attrs({
      d: path,
      fill: colourScale('Latin America')
    });
  
  mapLegend
    .selectAll('circle')
    .data(yearSlice, d => d.name)
    .enter()
    .append('circle')
    .attrs({
      class: 'cityMarker',
      cx: d => projection([d.lon, d.lat])[0],
      cy: d => projection([d.lon, d.lat])[1],
      r: 3
    })
    .styles({
      stroke: '#666666',
      fill: '#000000',
      'fill-opacity': 0.3
    });
  
  d3.timeout(_ => {
    
    svg.selectAll('.yearIntro')
      .transition()
      .duration(1000)
      .ease(d3.easeLinear)
      .styles({
        opacity: 0
      });
  
    let ticker = d3.interval(e => {

      yearSlice = dataset.filter(d => d.year == year && !isNaN(d.value))
        .sort((a,b) => b.value - a.value)
        .slice(0,top_n);

      yearSlice.forEach((d,i) => d.rank = i);

      x.domain([0, d3.max(yearSlice, d => d.value)]);

      svg.select('.xAxis')
        .transition()
        .duration(tickDuration)
        .ease(d3.easeLinear)
        .call(xAxis);

      let bars = svg.selectAll('.bar').data(yearSlice, d => d.name);

      bars
        .enter()
        .append('rect')
        .attrs({
          class: d => `bar ${d.name.replace(/\s/g,'_')}`,
          x: x(0)+1,
          width: d => x(d.value)-x(0)-1,
          y: d => y(top_n+1)+5,
          height: y(1)-y(0)-barPadding
        })
        .styles({
          fill: d => colourScale(d.group)
          // fill: d => d.colour
        })
        .transition()
          .duration(tickDuration)
          .ease(d3.easeLinear)
          .attrs({
            y: d => y(d.rank)+5
          });

      bars
        .transition()
          .duration(tickDuration)
          .ease(d3.easeLinear)
          .attrs({
            width: d => x(d.value)-x(0)-1,
            y: d => y(d.rank)+5
          });

      bars
        .exit()
        .transition()
          .duration(tickDuration)
          .ease(d3.easeLinear)
          .attrs({
            width: d => x(d.value)-x(0)-1,
            y: d => y(top_n+1)+5
          })
          .remove();

      let labels = svg.selectAll('.label').data(yearSlice, d => d.name);

      labels
        .enter()
        .append('text')
        .attrs({
          class: 'label',
          transform: d => `translate(${x(d.value)-5}, ${y(top_n+1)+5+((y(1)-y(0))/2)-8})`,
          'text-anchor': 'end'
        })
        .html('')    
        .transition()
          .duration(tickDuration)
          .ease(d3.easeLinear)
          .attrs({
            transform: d => `translate(${x(d.value)-5}, ${y(d.rank)+5+((y(1)-y(0))/2)-8})`
          });

      let tspans = labels
        .selectAll('tspan')
        .data(d => [{text: d.name, opacity: 1, weight:600}, {text: d.subGroup, opacity: 1, weight:400}]);

      tspans.enter()
        .append('tspan')
        .html(d => d.text)
        .attrs({
          x: 0,
          dy: (d,i) => i*16
        })
        .styles({
          fill: d => d.weight == 400 ? '#444444':'',
          'font-weight': d => d.weight,
          'font-size': d => d.weight == 400 ? '10px':''
        });

      tspans
        .html(d => d.text)
        .attrs({
          x: 0,
          dy: (d,i) => i*16
        })
        .styles({
          fill: d => d.weight == 400 ? '#444444':'',
          'font-weight': d => d.weight,
          'font-size': d => d.weight == 400 ? '10px':''
        });

      tspans.exit()
        .remove();

      labels
        .transition()
        .duration(tickDuration)
          .ease(d3.easeLinear)
          .attrs({
            transform: d => `translate(${x(d.value)-5}, ${y(d.rank)+5+((y(1)-y(0))/2)-8})`
          });

      labels
        .exit()
        .transition()
          .duration(tickDuration)
          .ease(d3.easeLinear)
          .attrs({
            transform: d => `translate(${x(d.value)-8}, ${y(top_n+1)+5})`
          })
          .remove();

      let valueLabels = svg.selectAll('.valueLabel').data(yearSlice, d => d.name);

      valueLabels
        .enter()
        .append('text')
        .attrs({
          class: 'valueLabel',
          x: d => x(d.value)+5,
          y: d => y(top_n+1)+5,
        })
        .text(d => d3.format(',.0f')(d.lastValue))
        .transition()
          .duration(tickDuration)
          .ease(d3.easeLinear)
          .attrs({
            y: d => y(d.rank)+5+((y(1)-y(0))/2)+1
          });

      valueLabels
        .transition()
          .duration(tickDuration)
          .ease(d3.easeLinear)
          .attrs({
            x: d => x(d.value)+5,
            y: d => y(d.rank)+5+((y(1)-y(0))/2)+1
          })
          .tween("text", function(d) {
            let i = d3.interpolateRound(d.lastValue, d.value);
            return function(t) {
              this.textContent = d3.format(',')(i(t));
            };
          });

      valueLabels
        .exit()
        .transition()
          .duration(tickDuration)
          .ease(d3.easeLinear)
          .attrs({
            x: d => x(d.value)+5,
            y: d => y(top_n+1)+5
          })
          .remove();

      let cityMarkers = svg.select('.map-legend').selectAll('.cityMarker').data(yearSlice, d => d.name);

      cityMarkers
        .enter()
        .append('circle')
        .attrs({
          class: 'cityMarker',
          cx: d => projection([d.lon, d.lat])[0],
          cy: d => projection([d.lon, d.lat])[1],
          r: 0
        })
        .styles({
          stroke: 'none',
          fill: 'none'
        })
        .transition()
          .duration(tickDuration)
          .ease(d3.easeLinear)
          .attrs({
            r: 10
          });

      cityMarkers
        .attrs({
          class: 'cityMarker',
          cx: d => projection([d.lon, d.lat])[0],
          cy: d => projection([d.lon, d.lat])[1],
          r: 3
        })
        .styles({
          stroke: 'none',
          fill: 'none',
          'fill-opacity': 0.3
        })
        .transition()
          .duration(tickDuration)
          .ease(d3.easeLinear)
          .attrs({
            r: 3
          });

      cityMarkers
        .exit()
        .transition()
          .duration(tickDuration)
          .ease(d3.easeLinear)
          .attrs({
            r: 0
          })
          .remove();

      yearText.html(~~year);

      if(year == endYear) ticker.stop();
      year = year + 1;
    },tickDuration);
  
  }, 1000);

  return svg.node();
}
);
  main.variable(observer()).define(["md"], function(md){return(
md ` ## Below are the parameters that you can tweak to answer questions regarding historical trends for any time frame, for any amount of countries`
)});
  main.variable(observer()).define(["md"], function(md){return(
md `### The cell below defines number of countries you want to see the data for i.e top 10 or top 20 etc.`
)});
  main.variable(observer("top_n")).define("top_n", function(){return(
15
)});
  main.variable(observer()).define(["md"], function(md){return(
md `#### Below 2 cells set the timeframe of animation. Fill in the years between which you want to see the animation. The gap can range from 1 year to 40 years i.e 1973-2013 (some countries have data older than 1973, dating as back as 1950s. You can view them if you change year to 1950s but there are only a handful of them)`
)});
  main.variable(observer("viewof startYear")).define("viewof startYear", ["slider"], function(slider){return(
slider({
  min: 1973, 
  max: 2012,  
  value: 1973,
  precision: 0,
  title: `Starting Year`,
  description: `Choose value from where to start the visualization`
})
)});
  main.variable(observer("startYear")).define("startYear", ["Generators", "viewof startYear"], (G, _) => G.input(_));
  main.variable(observer("viewof endYear")).define("viewof endYear", ["slider"], function(slider){return(
slider({
  min: 1974, 
  max: 2013,  
  value: 2013,
  precision: 0,
  title: `Ending Year`,
  description: `Choose year where to end the visualization`
})
)});
  main.variable(observer("endYear")).define("endYear", ["Generators", "viewof endYear"], (G, _) => G.input(_));
  main.variable(observer()).define(["md"], function(md){return(
md `### This sets the duration of animation for each year. Increase the value to slow the speed of animation between each year. 
FYI: More the number of years, longer the animation and more patient you will have to be :D`
)});
  main.variable(observer("tickDuration")).define("tickDuration", function(){return(
2000
)});
  main.variable(observer()).define(["md"], function(md){return(
md ` # APPENDIX `
)});
  main.variable(observer("scale")).define("scale", ["d3"], function(d3){return(
d3.scaleOrdinal()
    .domain(["South Asia","Europe","Asia","Latin America","Middle East","North America","Africa"])
    .range(["#ce7c2f", "#1285b3", "#C7432B", "#7cce2f", "#eb09be", "#5d9e9b", "#4b0b99"])
)});
  main.variable(observer("legend")).define("legend", ["d3Legend","scale"], function(d3Legend,scale){return(
d3Legend.legendColor()
  .shapePadding(25) // cell padding
  .labelOffset(20)  // label offset from the shape
  .scale(scale)
)});
  main.variable(observer()).define(["html"], function(html){return(
html`<style>
text{
  font-size: 16px;
  font-family: PT Sans;
}
text.title{
  font-size: 28px;
  font-weight: 600;
}
text.subTitle{
  font-weight: 500;
  fill: #777777;
}
text.label{
  font-size: 14px;
  fill: black;
}
.map-legend text{
  font-size: 12px;
  fill: #777777;
}
text.caption{
  font-weight: 400;
  font-size: 14px;
  fill: #999999;
}
text.yearText{
  font-size: 96px;
  font-weight: 700;
  fill: #cccccc;
}
text.yearIntro{
  font-size: 48px;
  font-weight: 700;
  fill: #cccccc;
}
.tick text {
  fill: #777777;
}
.xAxis .tick:nth-child(2) text {
  text-anchor: start;
}
.tick line {
  shape-rendering: CrispEdges;
  stroke: #dddddd;
}
.tick line.origin{
  stroke: #aaaaaa;
}
path.domain{
  display: none;
}
</style>`
)});
  main.variable(observer("height")).define("height", function(){return(
700
)});
  main.variable(observer("dataset")).define("dataset", ["d3"], function(d3){return(
d3.csv('https://gist.githubusercontent.com/iamvibhorsingh/f6b863b30e366c9fe0cf2821ee98a5c2/raw/f24c02fe831d703e7cd2a9e5daa9c483ba8cc9ef/dataset.csv')
)});
  main.variable(observer("haloHighlight")).define("haloHighlight", ["d3"], function(d3){return(
function(text, delay, strokeWidth=1, opacity=1, color='#000000') {
  let textObject = text.select(function() { return this.parentNode.insertBefore(this.cloneNode(true), this); })
    .styles({
      fill: '#ffffff',
      stroke: color,
      'stroke-width': 0,
      'stroke-linejoin': 'round',
      opacity: opacity
    });
  textObject
    .transition()
      .ease(d3.easeLinear)
      .delay(delay)
      .duration(250)
      .styles({
        'stroke-width': strokeWidth
      })
      .transition()
        .ease(d3.easeLinear)
        .delay(500)
        .duration(250)
        .styles({
          'stroke-width': 0
        });
}
)});
  main.variable(observer("halo")).define("halo", function(){return(
function(text, strokeWidth, color='#ffffff') {
  text.select(function() { return this.parentNode.insertBefore(this.cloneNode(true), this); })
    .styles({
      fill: color,
      stroke: color,
      'stroke-width': strokeWidth,
      'stroke-linejoin': 'round',
      opacity: 1
    });
}
)});
  main.variable(observer("projection")).define("projection", ["d3","land"], function(d3,land){return(
d3.geoNaturalEarth1()
  .fitSize([220, 125], land)
)});
  main.variable(observer("land")).define("land", ["topojson","world_simplified"], function(topojson,world_simplified){return(
topojson.feature(world_simplified, {
    type: 'GeometryCollection',
    geometries: world_simplified.objects.ne_10m_admin_0_countries.geometries.filter(d => ['Antarctica','Greenland'].includes(d.properties.ADMIN))
  })
)});
  main.variable(observer("world")).define("world", ["d3"], function(d3){return(
d3.json('https://gist.githubusercontent.com/johnburnmurdoch/b6a18add7a2f8ee87a401cb3055ccb7b/raw/f46c5c442c5191afc105b934b4b68c653545b7c1/ne_10m_simplified.json')
)});
  main.variable(observer("world_simplified")).define("world_simplified", ["topojson","world"], function(topojson,world)
{
  let word_simplified = topojson.presimplify(world);
  let min_weight = topojson.quantile(word_simplified, 0.3);
  word_simplified = topojson.simplify(word_simplified, min_weight);
  
  let land = word_simplified;  
  
  return land
}
);
  main.variable(observer("topojson")).define("topojson", ["require"], function(require){return(
require('topojson-client@3', 'topojson-simplify@3')
)});
  main.variable(observer("d3")).define("d3", ["require"], function(require){return(
require('d3-scale','d3-array','d3-fetch','d3-selection','d3-timer','d3-color','d3-format','d3-ease','d3-interpolate','d3-axis', 'd3-geo', 'd3-selection-multi')
)});
  const child1 = runtime.module(define1);
  main.import("slider", child1);
  main.variable(observer("d3Legend")).define("d3Legend", ["require"], function(require){return(
require("d3-svg-legend")
)});
  return main;
}
