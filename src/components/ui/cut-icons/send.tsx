import React from "react";
import { createCutIcon } from "./create-cut-icon";

// A paper plane. The old artwork was an up-right arrow, which people took for
// "open in a new window" (and the Global chat pop-out now uses exactly that).
export default createCutIcon("CutSend", () => <>
<path d="M4 4.5L28.5 16L4 27.5L8.6 16Z M7.9 8.9L10.6 15L22.6 15Z M10.6 17L7.9 23.1L22.6 17Z" fill="currentColor" fillRule="evenodd"/>
</>);
