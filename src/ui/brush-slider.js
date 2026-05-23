import state from '../state.js';

var sliderTrack, sliderHandle, brushPreview;
var sliderDragging = false;
var sliderGrabY = 0;
var sliderCachedTrackTop = 0, sliderCachedMaxTop = 0, sliderCachedHandleH = 0;
var sliderRafScheduled = false, sliderPendingY = 0;

function cacheSliderRects() {
  var tr = sliderTrack.getBoundingClientRect();
  sliderCachedTrackTop = tr.top;
  sliderCachedHandleH = sliderHandle.offsetHeight;
  sliderCachedMaxTop = sliderTrack.clientHeight - sliderCachedHandleH;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function updateBrushPreview() {
  if (!brushPreview) return;
  var size = 4 + (state.brushSize - 1)/59*32;
  brushPreview.style.width = size + 'px';
  brushPreview.style.height = size + 'px';
  brushPreview.style.background = state.color;
}

function applyHandleTop(topPx) {
  var maxTop = sliderCachedMaxTop > 0 ? sliderCachedMaxTop : (sliderTrack.clientHeight - sliderHandle.offsetHeight);
  topPx = clamp(topPx, 0, maxTop);
  sliderHandle.style.top = topPx + 'px';
  var pct = maxTop > 0 ? 1 - topPx/maxTop : 0.5;
  state.brushSize = Math.round(1 + pct*59);
  updateBrushPreview();
}

function initSlider() {
  cacheSliderRects();
  applyHandleTop(sliderCachedMaxTop * 0.5);
}

function startSliderJumpDrag(clientY) {
  cacheSliderRects();
  var targetTop = clientY - sliderCachedTrackTop - sliderCachedHandleH/2;
  sliderHandle.classList.add('jumping');
  applyHandleTop(targetTop);
  sliderGrabY = sliderCachedHandleH/2;
  sliderDragging = true;
  sliderHandle.classList.remove('anim-release', 'anim-press');
  sliderHandle.offsetHeight;
  sliderHandle.classList.add('grabbing', 'anim-press');
  setTimeout(function() { sliderHandle.classList.remove('jumping'); }, 200);
}

export function onSliderMove(clientY) {
  if (!sliderDragging) return;
  sliderPendingY = clientY;
  if (sliderRafScheduled) return;
  sliderRafScheduled = true;
  requestAnimationFrame(function() {
    sliderRafScheduled = false;
    if (!sliderDragging) return;
    applyHandleTop(sliderPendingY - sliderCachedTrackTop - sliderGrabY);
  });
}

export function onSliderRelease() {
  if (!sliderDragging) return;
  sliderDragging = false;
  sliderHandle.classList.remove('grabbing', 'anim-press');
  sliderHandle.offsetHeight;
  sliderHandle.classList.add('anim-release');
  sliderHandle.addEventListener('animationend', function h() {
    sliderHandle.removeEventListener('animationend', h);
    sliderHandle.classList.remove('anim-release');
  });
}

export function initBrushSlider() {
  sliderTrack = document.getElementById('slider-track');
  sliderHandle = document.getElementById('slider-handle');
  brushPreview = document.getElementById('brush-preview');

  sliderHandle.addEventListener('mousedown', function(e) {
    e.preventDefault(); e.stopPropagation();
    cacheSliderRects();
    var r = sliderHandle.getBoundingClientRect();
    sliderGrabY = e.clientY - r.top;
    sliderDragging = true;
    sliderHandle.classList.remove('anim-release', 'anim-press');
    sliderHandle.offsetHeight;
    sliderHandle.classList.add('grabbing', 'anim-press');
  });
  sliderHandle.addEventListener('touchstart', function(e) {
    e.preventDefault();
    cacheSliderRects();
    var r = sliderHandle.getBoundingClientRect();
    sliderGrabY = e.touches[0].clientY - r.top;
    sliderDragging = true;
    sliderHandle.classList.remove('anim-release', 'anim-press');
    sliderHandle.offsetHeight;
    sliderHandle.classList.add('grabbing', 'anim-press');
  }, {passive: false});

  sliderTrack.addEventListener('mousedown', function(e) {
    e.preventDefault();
    startSliderJumpDrag(e.clientY);
  });
  sliderTrack.addEventListener('touchstart', function(e) {
    e.preventDefault();
    startSliderJumpDrag(e.touches[0].clientY);
  }, {passive: false});

  new ResizeObserver(function() { requestAnimationFrame(initSlider); }).observe(sliderTrack);
}
