import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Globe,
  GraduationCap,
  Mail,
} from "lucide-react";

export interface PortalLink {
  id: string;
  title: string;
  description: string;
  href: string;
  external: boolean;
  icon: LucideIcon;
}

export interface PortalLinkSection {
  id: string;
  title: string;
  links: PortalLink[];
}

export const PORTAL_SECTIONS: PortalLinkSection[] = [
  {
    id: "sales-tools",
    title: "Sales Tools",
    links: [
      {
        id: "leadspply",
        title: "LeadSpply",
        description: "Leads, quotes, and client management.",
        href: "https://leadspply.com/",
        external: true,
        icon: BarChart3,
      },
      {
        id: "gmail",
        title: "Gmail",
        description: "Your @thepncl.com email inbox.",
        href: "https://mail.google.com",
        external: true,
        icon: Mail,
      },
    ],
  },
  {
    id: "training",
    title: "Training & Resources",
    links: [
      {
        id: "pinnacle-genesis",
        title: "Pinnacle Genesis",
        description: "Agent training platform and curriculum.",
        href: "https://www.pinnaclegenesis.cc/",
        external: true,
        icon: GraduationCap,
      },
    ],
  },
  {
    id: "pncl",
    title: "PNCL",
    links: [
      {
        id: "website",
        title: "Company Website",
        description: "Public PNCL site and product pages.",
        href: "/",
        external: false,
        icon: Globe,
      },
    ],
  },
];
