import { Card } from "@/components/ui/card";
import { ExternalLink, Database, FileText, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DataSources() {
  const sources = [
    {
      name: "USAspending.gov",
      description: "Official source for federal spending data",
      url: "https://www.usaspending.gov/",
      icon: <Database className="h-5 w-5" />,
    },
    {
      name: "Grants.gov",
      description: "Federal grant opportunities and awards",
      url: "https://www.grants.gov/",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      name: "State Budget Websites",
      description: "Individual state appropriations and budgets",
      url: "#",
      icon: <Globe className="h-5 w-5" />,
    },
    {
      name: "NASBO Reports",
      description: "National Association of State Budget Officers",
      url: "https://www.nasbo.org/",
      icon: <FileText className="h-5 w-5" />,
    },
  ];

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-foreground">Data Sources</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Free government and public data sources for funding information
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sources.map((source, index) => (
          <div
            key={index}
            className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-secondary/50 transition-colors"
          >
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              {source.icon}
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-foreground">{source.name}</h4>
              <p className="text-sm text-muted-foreground mt-1">
                {source.description}
              </p>
              {source.url !== "#" && (
                <Button
                  variant="link"
                  className="h-auto p-0 mt-2 text-primary"
                  asChild
                >
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1"
                  >
                    Visit source <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
