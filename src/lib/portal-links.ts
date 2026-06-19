import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Globe,
  Mail,
  UserPlus,
  MessageCircle,
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
        id: "score",
        title: "CRM & Quoting",
        description: "Leads, quotes, and client management in Score.",
        href: "https://score.insure",
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
        id: "training",
        title: "Training Events",
        description: "Upcoming workshops, calls, and coaching sessions.",
        href: "https://www.thepinnaclelifegroup.com/events",
        external: true,
        icon: CalendarDays,
      },
      {
        id: "resources",
        title: "Agent Resources",
        description: "Scripts, guides, and sales materials.",
        href: "https://www.thepinnaclelifegroup.com",
        external: true,
        icon: BookOpen,
      },
    ],
  },
  {
    id: "pncl",
    title: "PNCL",
    links: [
      {
        id: "onboarding",
        title: "Agent Onboarding",
        description: "New agent setup and licensing workflow.",
        href: "/onboarding",
        external: false,
        icon: UserPlus,
      },
      {
        id: "website",
        title: "Company Website",
        description: "Public PNCL site and product pages.",
        href: "/",
        external: false,
        icon: Globe,
      },
      {
        id: "contact",
        title: "Contact Support",
        description: "Reach the PNCL team for help.",
        href: "/contact",
        external: false,
        icon: MessageCircle,
      },
    ],
  },
];
