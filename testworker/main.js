// main.js
var myworker = new Worker("worker.js"), width=window.innerWidth, height=window.innerHeight, context=document.getElementById('canvas').getContext('2d');
var imageData = context.createImageData(width,height);

myworker.onmessage = function(e){
    imageData.data.set(e.data);
};

// setTimeout(function draw_canvas() {
//   try {
//     context.putImageData(imageData);
//   } catch (e) {
//   }
//     setTimeout(draw_canvas, 1000/60);
// },10);
requestAnimationFrame(function draw_canvas() {
    context.putImageData(imageData, 0, 0);
    requestAnimationFrame(draw_canvas);
});

window.onresize = window.reload; // Quick (to type) n' dirty way to resize;
myworker.postMessage(JSON.stringify({width: width, height: height}));
