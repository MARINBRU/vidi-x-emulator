// Each exported Python string is a complete, independently runnable code.py.
// The small shared fragments are inlined so exported examples need no project
// files beside code.py; optional touch / neopixel hardware drivers are noted.
import base from './premadePython/base.py?raw';
import network from './premadePython/network.py?raw';
import lights from './premadePython/lights.py?raw';
import touch from './premadePython/touch.py?raw';
import raycast from './premadePython/raycast.py?raw';
import maze from './premadePython/maze.py?raw';
import fpsSingle from './premadePython/fpsSingle.py?raw';
import fpsMulti from './premadePython/fpsMulti.py?raw';
import pong from './premadePython/pong.py?raw';
import space from './premadePython/space.py?raw';
import diagnostics from './premadePython/diagnostics.py?raw';
import scope from './premadePython/scope.py?raw';
import bridgePython from './premadePython/bridge.py?raw';
import painter from './premadePython/painter.py?raw';
import alarm from './premadePython/sensorAlarm.py?raw';
import messenger from './premadePython/messenger.py?raw';
import quiz from './premadePython/quiz.py?raw';
import gyroCpp from './premadeCpp/gyro.ino?raw';
import quizCpp from './premadeCpp/quiz.ino?raw';
import bridgeCpp from './premadeCpp/bridge.ino?raw';

const join = (...parts: string[]) => parts.map((part) => part.trim()).join('\n\n') + '\n';
const pythonMaze = join(base, lights, raycast, maze);
const pythonFpsSingle = join(base, lights, raycast, fpsSingle);
const pythonFpsMulti = join(base, network, raycast, fpsMulti);

export const PYTHON_QUIZ = join(base, touch, quiz);
export const PREMADE_PYTHON_VARIANTS: Record<string, string> = {
  'premade-3d-maze': pythonMaze,
  'premade-3d-fps-1p': pythonFpsSingle,
  'premade-3d-fps-2p': pythonFpsMulti,
  'premade-espnow-pong': join(base, network, pong),
  'premade-space-defender': join(base, lights, space),
  'premade-diagnostics': join(base, touch, diagnostics),
  'premade-synth-scope': join(base, scope),
  'premade-sd-logger': join(base, bridgePython),
  'premade-python-quiz': PYTHON_QUIZ,
  'premade-block-0': join(base, touch, painter),
  'premade-block-1': join(base, alarm),
  'premade-block-2': join(base, network, lights, messenger),
  'premade-block-3': pythonMaze,
  'premade-block-4': pythonFpsSingle,
  'premade-block-5': pythonFpsMulti,
};

export const PREMADE_CPP_VARIANTS: Record<string, string> = {
  'premade-python-gyro': gyroCpp,
  'premade-python-quiz': quizCpp,
  'premade-sd-logger': bridgeCpp,
};
