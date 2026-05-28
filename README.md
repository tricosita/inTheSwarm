# Solitude in the Swarm

> **Un enjambre de luz que canta y se conecta al tocarse.**
> **Un destello solitario que busca entrar en el compás, pero cuyo mero acercamiento siembra el silencio.**
> 
> **Puedes vestirte con sus mismos colores, pero el vacío invisible permanece.**

---

Una experiencia interactiva y generativa sobre el espacio que nos separa, aun cuando parecemos iguales. 

## Características

- **Simulación física de enjambre (Boids)**: Esporas de luz que se agrupan, crean conexiones y fluyen armónicamente.
- **Interacción dinámica**: El cursor repele suavemente al enjambre, creando una burbuja invisible de aislamiento y silencio físico a tu alrededor.
- **Audio generativo**: Los enlaces formados por el enjambre sintetizan melodías en una escala pentatónica cálida usando la Web Audio API. Tu cercanía silencia y atenúa la música, activando un zumbido bajo y solitario.
- **Panel de control**: Modifica la velocidad del enjambre, su densidad y rango de conexión.
- **Ilusión de adaptación**: Prueba a usar el botón *"Try to Blend In"* para copiar la frecuencia, el pulso y el color exacto del enjambre. Descubre si eso rompe la distancia.

## Cómo ejecutar localmente

Dado que utiliza la API de Web Audio, se recomienda ejecutarlo mediante un servidor local para evitar limitaciones de seguridad del navegador:

```bash
python3 -m http.server 8000
```

Luego abre [http://localhost:8000](http://localhost:8000) en tu navegador.
