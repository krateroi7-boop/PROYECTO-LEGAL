import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role?: "user" | "reviewer" | "admin";
  }

  interface Session {
    user: User & {
      id: string;
      role: "user" | "reviewer" | "admin";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "user" | "reviewer" | "admin";
  }
}
