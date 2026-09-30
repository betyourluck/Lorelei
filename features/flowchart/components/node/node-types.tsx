import { SUBGRAPH_NODE_TYPE } from "../../utils/subgraph-tree";
import { EditableNode } from "./editable-node";
import { SubgraphNode } from "./subgraph-node";

export const nodeTypes = {
  editableNode: EditableNode,
  [SUBGRAPH_NODE_TYPE]: SubgraphNode,
};
