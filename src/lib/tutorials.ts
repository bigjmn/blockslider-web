import { PuzzleProps } from "@/components/DemoGame"

export const tutorialA:PuzzleProps = {
    gameState:{
  "ball": {
    "x": 7,
    "y": 2
  },
  "goal": {
    "x": 7,
    "y": 5
  },
  "initialPieces": [
    {
      "id": "1",
      "type": "car",
      "x": 2,
      "y": 0,
      "orientation": "H",
      "direction": "right",
      "color": "bg-red-500",
      "label": "R"
    },
    {
      "id": "2",
      "type": "car",
      "x": 5,
      "y": 0,
      "orientation": "V",
      "direction": "down",
      "color": "bg-blue-500",
      "label": "B"
    },
    {
      "id": "3",
      "type": "car",
      "x": 7,
      "y": 3,
      "orientation": "V",
      "direction": "down",
      "color": "bg-emerald-500",
      "label": "G"
    },
  ]
},
tutorial: 
    [
        {move: "1", message: "Tap a block to slide it. Blocks only go forwards."},
        {move: "1", message: "A block can push another block broadside as long as there is space."},
        {move: "1", message: 'The pushed block must have the spaces immediately available - i.e. no "combo pushes"'},
        {move: "3", message: "The goal is to get the ball to the portal"},
        {move: "3", message: "The ball can't move on its own - it must be pushed."},
        {move: "3", message: "Blocks can slide and be pushed over the portal like any other empty square."},
        {move: "2", message: "Try to find the solution with as few takebacks and restarts as possible!"},
        {move: "2", message: "Block Slider is brought to you by J Nicks Productions"},
        {move: "2", message: "Block Slider is brought to you by J Nicks Productions"}

    ]

}