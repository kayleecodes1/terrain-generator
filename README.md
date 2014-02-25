# Terrain Generator

A JavaScript terrain generator made as a final project for a Game AI class at Northeastern University.

I learned a lot working on this project. For the main ideas behind the generation, I implemented a lot of the methods used by Amit Patel in his article that can be found here: http://www-cs-students.stanford.edu/~amitp/game-programming/polygon-map-generation/. I strongly recommend reading it for insight into how this terrain generation works. My methods don't vary too much.

It was fun to learn about Voronoi polygons and representing and working with them in JS was a challenge. I used a handy dictionary implementation using JavaScript objects when storing and working with the data.

I used the Raphael library for rendering the map itself and a nice pre-built RequestAnimationFrame snippet to handle updating the render. I also used a Voronoi JS library (https://github.com/gorhill/Javascript-Voronoi) to do the initial simulation of the Voronoi polygons, although I smoothed and adjusted this data myself afterwards. Another main component was a perlin JS utility that I sampled from to determine land and water tiles.