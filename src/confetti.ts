const colors = ['#d46d8a', '#e1ae5f', '#7f9c66'];

export function celebrate(canvas: HTMLCanvasElement): () => void {
  const context = canvas.getContext('2d');
  if (!context) return () => {};

  const { width, height } = canvas.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.ceil(width * ratio);
  canvas.height = Math.ceil(height * ratio);
  context.scale(ratio, ratio);

  let start: number | undefined;
  let frame = requestAnimationFrame(draw);

  function draw(time: number) {
    if (!context) return;
    start ??= time;
    const elapsed = time - start;
    context.clearRect(0, 0, width, height);
    for (let index = 0; index < 20; index++) {
      const age = (elapsed - index * 19) / 720;
      if (age < 0 || age >= 1) continue;
      const x = width * (index * 37 % 100) / 100 + (index * 11 % 76 - 38) * age;
      const y = -10 + 195 * age ** 1.65;
      context.save();
      context.globalAlpha = Math.min(1, age * 5, (1 - age) * 2);
      context.translate(x, y);
      context.rotate(age * Math.PI * (index % 2 ? 1.5 : -1.5));
      context.fillStyle = colors[index % colors.length];
      context.fillRect(-3, -4, 6, 8);
      context.restore();
    }
    if (elapsed < 1100) frame = requestAnimationFrame(draw);
  }

  return () => cancelAnimationFrame(frame);
}
