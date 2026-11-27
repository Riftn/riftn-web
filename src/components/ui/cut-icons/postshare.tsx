import React from "react";
import type { LucideProps } from "lucide-react";
import CutFeedShare from "./feedshare";
import CutFeedDistribute from "./feeddistribute";
import { useShareIconStyle } from "@/lib/share-icon-style";

/** The post Share button glyph, following the person's Share icon setting. */
const PostShareIcon = React.forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
  const style = useShareIconStyle();
  return style === 'distribute' ? <CutFeedDistribute ref={ref} {...props} /> : <CutFeedShare ref={ref} {...props} />;
});
PostShareIcon.displayName = "PostShareIcon";

export default PostShareIcon;
