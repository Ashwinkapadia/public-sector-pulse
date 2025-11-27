import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface NetworkNode {
  id: string;
  name: string;
  type: "prime" | "subaward";
  amount: number;
  state: string;
}

interface NetworkLink {
  source: string;
  target: string;
  amount: number;
}

interface SubawardNetworkDiagramProps {
  data: any[];
}

export function SubawardNetworkDiagram({ data }: SubawardNetworkDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data || data.length === 0) return;

    // Clear previous content
    d3.select(svgRef.current).selectAll("*").remove();

    // Prepare data
    const nodes: NetworkNode[] = [];
    const links: NetworkLink[] = [];
    const nodeMap = new Map<string, NetworkNode>();

    data.forEach((record: any) => {
      const primeId = record.organization.id;
      
      if (!nodeMap.has(primeId)) {
        const primeNode: NetworkNode = {
          id: primeId,
          name: record.organization.name,
          type: "prime",
          amount: record.amount,
          state: record.organization.state,
        };
        nodes.push(primeNode);
        nodeMap.set(primeId, primeNode);
      }

      record.subawards?.forEach((subaward: any) => {
        const subId = subaward.recipient_organization.id;
        
        if (!nodeMap.has(subId)) {
          const subNode: NetworkNode = {
            id: subId,
            name: subaward.recipient_organization.name,
            type: "subaward",
            amount: subaward.amount,
            state: subaward.recipient_organization.state,
          };
          nodes.push(subNode);
          nodeMap.set(subId, subNode);
        }

        links.push({
          source: primeId,
          target: subId,
          amount: subaward.amount,
        });
      });
    });

    // Set up dimensions
    const width = svgRef.current.clientWidth;
    const height = 600;

    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height]);

    // Create force simulation
    const simulation = d3
      .forceSimulation(nodes as any)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d: any) => d.id)
          .distance(150)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(50));

    // Create arrow marker for links
    svg
      .append("defs")
      .append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "hsl(var(--muted-foreground))");

    // Create links
    const link = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "hsl(var(--muted-foreground))")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", (d: any) => Math.sqrt(d.amount / 50000))
      .attr("marker-end", "url(#arrowhead)");

    // Create nodes
    const node = svg
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(
        d3
          .drag<any, any>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      );

    // Add circles to nodes
    node
      .append("circle")
      .attr("r", (d: any) => (d.type === "prime" ? 20 : 12))
      .attr("fill", (d: any) =>
        d.type === "prime" ? "hsl(var(--primary))" : "hsl(var(--secondary))"
      )
      .attr("stroke", "hsl(var(--background))")
      .attr("stroke-width", 2);

    // Add labels to nodes
    node
      .append("text")
      .text((d: any) => d.name.length > 20 ? d.name.substring(0, 20) + "..." : d.name)
      .attr("x", 0)
      .attr("y", -25)
      .attr("text-anchor", "middle")
      .attr("fill", "hsl(var(--foreground))")
      .attr("font-size", "10px")
      .attr("font-weight", (d: any) => (d.type === "prime" ? "bold" : "normal"));

    // Add tooltips
    node.append("title").text(
      (d: any) =>
        `${d.name}\n${d.state}\n${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 0,
        }).format(d.amount)}`
    );

    // Update positions on each tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No data available for network visualization
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Award Network Diagram</CardTitle>
        <CardDescription>
          Visual representation of prime awards (large circles) flowing to subaward recipients
          (small circles). Drag nodes to rearrange.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-hidden rounded-lg border bg-background">
          <svg ref={svgRef} className="w-full" />
        </div>
        <div className="mt-4 flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-full bg-primary" />
            <span className="text-muted-foreground">Prime Award Recipients</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-secondary" />
            <span className="text-muted-foreground">Subaward Recipients</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
