/**
 * @file Анимация конфетти для лендинга.
 *
 * Частицы рисуются на отдельном canvas поверх страницы.
 * Все величины пересчитываются через delta-time, поэтому скорость
 * анимации не зависит от частоты кадров.
 */

(() => {
  "use strict";

  /**
   * Одна частица конфетти.
   * @typedef {Object} Particle
   * @property {number} x          Координата X в CSS-пикселях.
   * @property {number} y          Координата Y в CSS-пикселях.
   * @property {number} vx         Скорость по X, px за кадр при 60 FPS.
   * @property {number} vy         Скорость по Y, px за кадр при 60 FPS.
   * @property {number} gravity    Ускорение свободного падения.
   * @property {number} drag       Коэффициент сопротивления воздуха.
   * @property {number} rot        Текущий угол поворота, радианы.
   * @property {number} vrot       Скорость вращения.
   * @property {number} wobble     Фаза «порхания» бумажки.
   * @property {number} wobbleSpeed Скорость изменения фазы.
   * @property {number} w          Ширина частицы.
   * @property {number} h          Высота частицы.
   * @property {string} color      Цвет заливки.
   * @property {number} life       Остаток времени жизни в кадрах.
   */

  /** Палитра частиц. */
  const COLORS = ["#a78bfa", "#8b5cf6", "#67e8f9", "#22d3ee", "#f472b6", "#fbbf24", "#4ade80"];

  /** Предел одновременных частиц: защита от частых кликов. */
  const MAX_PARTICLES = 600;

  /** Число частиц для обычного режима. */
  const NORMAL_PARTICLE_COUNT = 170;

  /** Число частиц для режима уменьшенного движения. */
  const REDUCED_PARTICLE_COUNT = 50;

  /** Множитель начальной скорости разлёта. */
  const SPEED_FACTOR = 0.85;

  /** Длительность кадра при 60 FPS, мс. */
  const FRAME_MS = 1000 / 60;

  /** Предел шага симуляции, чтобы после паузы вкладки частицы не «телепортировались». */
  const MAX_DELTA_FRAMES = 2.5;

  const canvas = document.getElementById("confetti");
  const ctx = canvas.getContext("2d");
  const button = document.getElementById("spark");
  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  /** Признак включённого режима уменьшенного движения. */
  let reduceMotion = reduceMotionQuery.matches;

  /** @type {Particle[]} */
  let particles = [];
  let raf = null;
  let lastFrame = 0;
  let viewW = 0;
  let viewH = 0;
  let dpr = 1;

  /**
   * Подгоняет размер канваса под окно с учётом плотности пикселей.
   * @returns {void}
   */
  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    canvas.style.width = viewW + "px";
    canvas.style.height = viewH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Создаёт одну частицу в точке вылета.
   * @param {number} x Координата вылета по X.
   * @param {number} y Координата вылета по Y.
   * @returns {Particle} Новая частица.
   */
  function createParticle(x, y) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.55;
    // На 15% ниже прежней скорости разлёта
    const speed =
      ((reduceMotion ? 6 : 12) + Math.random() * (reduceMotion ? 8 : 16)) * SPEED_FACTOR;
    const size = 5 + Math.random() * 8;

    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 0.26 + Math.random() * 0.12,
      drag: 0.992,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.4,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.08 + Math.random() * 0.12,
      w: size,
      h: size * (0.38 + Math.random() * 0.45),
      color: COLORS[(Math.random() * COLORS.length) | 0],
      life: 95 + Math.random() * 70
    };
  }

  /**
   * Отбрасывает самые старые частицы, если превышен предел.
   * @returns {void}
   */
  function trimParticles() {
    if (particles.length > MAX_PARTICLES) {
      particles.splice(0, particles.length - MAX_PARTICLES);
    }
  }

  /**
   * Запускает цикл анимации, если он ещё не идёт.
   * @returns {void}
   */
  function ensureAnimation() {
    if (raf === null) {
      lastFrame = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  /**
   * Выпускает порцию частиц из указанной точки.
   * @param {number} x Координата вылета по X.
   * @param {number} y Координата вылета по Y.
   * @param {number} count Сколько частиц выпустить.
   * @returns {void}
   */
  function spawnParticles(x, y, count) {
    for (let i = 0; i < count; i++) {
      particles.push(createParticle(x, y));
    }

    trimParticles();
    ensureAnimation();
  }

  /**
   * Сдвигает частицу на один шаг симуляции.
   * @param {Particle} particle Частица.
   * @param {number} dt Шаг времени в кадрах (1 = один кадр при 60 FPS).
   * @returns {void}
   */
  function stepParticle(particle, dt) {
    particle.vy += particle.gravity * dt;
    const drag = Math.pow(particle.drag, dt);
    particle.vx *= drag;
    particle.vy *= drag;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.rot += particle.vrot * dt;
    particle.wobble += particle.wobbleSpeed * dt;
    particle.life -= dt;
  }

  /**
   * Проверяет, пора ли удалить частицу.
   * @param {Particle} particle Частица.
   * @returns {boolean} true, если частица отжила или ушла за пределы экрана.
   */
  function isParticleDead(particle) {
    return (
      particle.life <= 0 ||
      particle.y > viewH + 80 ||
      particle.x < -100 ||
      particle.x > viewW + 100
    );
  }

  /**
   * Рисует одну частицу с эффектом «порхания» бумажки.
   * @param {Particle} particle Частица.
   * @returns {void}
   */
  function drawParticle(particle) {
    const squash = 0.25 + 0.75 * Math.abs(Math.cos(particle.wobble));
    const width = particle.w * squash;

    ctx.save();
    ctx.globalAlpha = Math.min(1, particle.life / 45);
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rot);
    ctx.fillStyle = particle.color;
    ctx.fillRect(-width / 2, -particle.h / 2, width, particle.h);
    ctx.restore();
  }

  /**
   * Очищает весь холст.
   * @returns {void}
   */
  function clearCanvas() {
    ctx.clearRect(0, 0, viewW, viewH);
  }

  /**
   * Шаг анимации: обновляет и рисует все частицы.
   * @param {number} now Текущее время от requestAnimationFrame, мс.
   * @returns {void}
   */
  function frame(now) {
    const dt = lastFrame ? Math.min((now - lastFrame) / FRAME_MS, MAX_DELTA_FRAMES) : 1;
    lastFrame = now;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clearCanvas();

    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      stepParticle(particle, dt);

      if (isParticleDead(particle)) {
        particles.splice(i, 1);
        continue;
      }

      drawParticle(particle);
    }

    if (particles.length > 0) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = null;
      lastFrame = 0;
      clearCanvas();
    }
  }

  /**
   * Обрабатывает клик по кнопке и выпускает конфетти из точки клика.
   * При активации с клавиатуры координаты берутся из центра кнопки.
   * @param {MouseEvent} event Событие клика.
   * @returns {void}
   */
  function handleClick(event) {
    const rect = button.getBoundingClientRect();
    const fromKeyboard = event.detail === 0;

    const x = fromKeyboard ? rect.left + rect.width / 2 : event.clientX;
    const y = fromKeyboard ? rect.top + rect.height / 2 : event.clientY;

    spawnParticles(x, y, reduceMotion ? REDUCED_PARTICLE_COUNT : NORMAL_PARTICLE_COUNT);
  }

  /**
   * Подхватывает переключение системной настройки «уменьшить движение»,
   * чтобы новые частицы сразу учитывали её без перезагрузки страницы.
   * @param {MediaQueryListEvent} event Событие изменения настройки.
   * @returns {void}
   */
  function handleMotionChange(event) {
    reduceMotion = event.matches;
  }

  button.addEventListener("click", handleClick);
  window.addEventListener("resize", resizeCanvas);
  reduceMotionQuery.addEventListener("change", handleMotionChange);
  resizeCanvas();
})();
