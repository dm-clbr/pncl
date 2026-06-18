import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function Home2HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 11);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const pts: [number, number][] = [
      [116.18, 0], [0.39, 115.79], [349.57, 115.79], [349.57, 254.75], [279.59, 324.73],
      [115.79, 324.73], [115.79, 145.32], [0, 261.1], [0, 534.43], [115.79, 534.43],
      [115.79, 440.32], [328.75, 440.32], [464.57, 304.5], [464.57, 0],
    ];
    const cx = 232.285;
    const cy = 267.215;
    const s = 1 / 150;
    const shape = new THREE.Shape();
    pts.forEach((p, i) => {
      const x = (p[0] - cx) * s;
      const y = (cy - p[1]) * s;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });

    const markGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.55,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 2,
    });
    markGeo.center();
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    const matDark = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.62, metalness: 0.25 });
    const matAccent = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.5, metalness: 0.3 });

    scene.add(new THREE.AmbientLight(0x3a3a44, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 0.55);
    key.position.set(-4, 6, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xdc6a2d, 1.5);
    rim.position.set(6, -2, 4);
    scene.add(rim);
    const fill = new THREE.PointLight(0xc24e1c, 1.1, 40);
    fill.position.set(8, 4, 6);
    scene.add(fill);

    const objs: THREE.Mesh[] = [];
    const add = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      pos: [number, number, number],
      sc: number,
      rot: [number, number, number]
    ) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.scale.setScalar(sc);
      m.rotation.set(...rot);
      m.userData = {
        rs: (Math.random() - 0.5) * 0.0016,
        rs2: (Math.random() - 0.5) * 0.0014,
        bob: Math.random() * Math.PI * 2,
        by: pos[1],
      };
      scene.add(m);
      objs.push(m);
      return m;
    };

    add(markGeo, matDark, [3.4, 1.6, -1], 1.5, [0.3, -0.5, 0.2]);
    add(markGeo, matAccent, [5.6, -1.4, -3], 1.05, [-0.4, 0.6, -0.3]);
    add(markGeo, matDark, [-4.2, 2.4, -5], 0.8, [0.6, 0.4, 0.5]);
    add(boxGeo, matDark, [1.8, 3.0, -4], 0.7, [0.5, 0.5, 0]);
    add(boxGeo, matAccent, [6.4, 2.2, -2], 0.45, [0.2, 0.7, 0.3]);
    add(boxGeo, matDark, [-2.4, -2.6, -3], 0.55, [0.8, 0.2, 0.4]);
    add(boxGeo, matDark, [4.2, -2.8, -6], 0.9, [0.3, 0.9, 0.1]);

    let mx = 0;
    let my = 0;
    let tmx = 0;
    let tmy = 0;
    const onMouseMove = (e: MouseEvent) => {
      tmx = e.clientX / window.innerWidth - 0.5;
      tmy = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const r = parent.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    let raf: number | null = null;
    let t = 0;

    const loop = () => {
      t += 0.01;
      mx += (tmx - mx) * 0.04;
      my += (tmy - my) * 0.04;
      objs.forEach((o) => {
        o.rotation.x += o.userData.rs;
        o.rotation.y += o.userData.rs2;
        o.position.y = o.userData.by + Math.sin(t + o.userData.bob) * 0.18;
      });
      camera.position.x = mx * 1.4;
      camera.position.y = -my * 1.0;
      camera.lookAt(2, 0, -2);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };

    requestAnimationFrame(() => canvas.classList.add("ready"));

    if (reduceMotion) {
      renderer.render(scene, camera);
    } else {
      loop();
    }

    const hero = document.querySelector(".home2-page .hero");
    const hio = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (reduceMotion) return;
          if (e.isIntersecting) {
            if (!raf) loop();
          } else {
            if (raf) cancelAnimationFrame(raf);
            raf = null;
          }
        });
      },
      { threshold: 0 }
    );
    if (hero) hio.observe(hero);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", resize);
      if (raf) cancelAnimationFrame(raf);
      hio.disconnect();
      renderer.dispose();
      markGeo.dispose();
      boxGeo.dispose();
      matDark.dispose();
      matAccent.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} id="hero-canvas" />;
}
