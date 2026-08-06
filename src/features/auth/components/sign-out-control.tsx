"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export function SignOutControl({
  action,
}: {
  action: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full border-rose-100 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
        onClick={() => setOpen(true)}
      >
        <LogOut data-icon="inline-start" />
        退出登录
      </Button>

      <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
        <DrawerContent className="mx-auto max-w-[420px] rounded-t-[20px] border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
          <DrawerHeader>
            <DrawerTitle>确认退出登录？</DrawerTitle>
            <DrawerDescription>
              退出后将返回首页，需要重新登录才能继续使用账户功能。
            </DrawerDescription>
          </DrawerHeader>

          <DrawerFooter className="pt-5">
            <form action={action}>
              <SignOutSubmitButton />
            </form>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function SignOutSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="destructive"
      className="h-11 w-full"
      disabled={pending}
    >
      <LogOut data-icon="inline-start" />
      {pending ? "退出中…" : "确认退出"}
    </Button>
  );
}
