import { List } from "@raycast/api";

// Empty placeholder view. RS5 wires this to engine.scan() from @reclaimd/core
// and renders real findings with a Detail view + Copy-only reclaim actions.
export default function Command() {
  return (
    <List>
      <List.EmptyView title="No findings yet" description="Run a scan to see reclaimable disk space here." />
    </List>
  );
}
