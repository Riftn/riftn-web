import React from "react";
import { createCutIcon } from "./create-cut-icon";

// Same artwork as the phone header log-in button (MobileAccountButton) and the
// app's HeaderAccountButton: a filled door on the right, arrow entering it.
export default createCutIcon("CutSignin", () => <>
<path d="M14 4H21.6C26.6 4 29.5 7.05 29.5 11.9V28H14V23H14.94Q16.4 23 16.4 24.46V25.6H27.1V11.9C27.1 8.49 25.17 6.4 21.6 6.4H16.4V8.75H15.46Q14 8.75 14 7.29Z" fill="currentColor"/><g transform="translate(-9.4 0)"><path d="M13.3920 17.2000L28.0000 17.2000L28.0000 16.1920Q28.0000 14.8000 26.6080 14.8000L12.0000 14.8000L12.0000 15.8080Q12.0000 17.2000 13.3920 17.2000Z" fill="currentColor"/><path d="M23.1358 12.8328L26.3029 16.0000L22.1515 20.1515L22.8642 20.8642Q23.8485 21.8485 24.8328 20.8642L29.6971 16.0000L23.8485 10.1515L23.1358 10.8642Q22.1515 11.8485 23.1358 12.8328Z" fill="currentColor"/></g>
</>);
