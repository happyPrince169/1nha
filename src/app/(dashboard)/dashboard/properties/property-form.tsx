"use client";

import { useActionState, type ReactNode } from "react";

import type { CreatePropertyState } from "./new/actions";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type FormAction = (
  prevState: CreatePropertyState,
  formData: FormData
) => Promise<CreatePropertyState>;

export type PropertyFormDefaults = {
  title?: string;
  property_type?: string;
  city?: string;
  district?: string;
  ward?: string;
  street?: string;
  price?: number | string;
  area?: number | string;
  bedrooms?: number | string;
  bathrooms?: number | string;
  house_direction?: string;
  alley_width?: number | string;
  frontage?: number | string;
  legal_status?: string;
  description?: string;
  strengths?: string;
  weaknesses?: string;
  owner_note?: string;
  planning_note?: string;
};

type PropertyFormProps = {
  action: FormAction;
  defaultValues?: PropertyFormDefaults;
  submitLabel?: string;
};

const initialState: CreatePropertyState = { error: null };

export function PropertyForm({
  action,
  defaultValues = {},
  submitLabel = "Lưu",
}: PropertyFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <FormError>{state.error}</FormError>}

      <Card>
        <CardHeader>
          <CardTitle>Thông tin cơ bản</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Field label="Tiêu đề" htmlFor="title">
            <Input
              id="title"
              name="title"
              placeholder="VD: Căn 2PN view sông, Vinhomes..."
              required
              defaultValue={defaultValues.title ?? ""}
              disabled={isPending}
            />
          </Field>

          <Field label="Loại bất động sản" htmlFor="property_type">
            <Select
              id="property_type"
              name="property_type"
              required
              defaultValue={defaultValues.property_type ?? ""}
              disabled={isPending}
            >
              <option value="" disabled>
                Chọn loại...
              </option>
              <option value="apartment">Căn hộ</option>
              <option value="house">Nhà phố</option>
              <option value="land">Đất</option>
              <option value="shophouse">Shophouse</option>
              <option value="villa">Villa</option>
              <option value="office">Văn phòng</option>
              <option value="other">Khác</option>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vị trí</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Field label="Thành phố" htmlFor="city">
            <Input
              id="city"
              name="city"
              placeholder="VD: Hà Nội"
              defaultValue={defaultValues.city ?? "Hà Nội"}
              disabled={isPending}
            />
          </Field>

          <Field label="Quận/Huyện" htmlFor="district">
            <Input
              id="district"
              name="district"
              placeholder="VD: Quận 2"
              required
              defaultValue={defaultValues.district ?? ""}
              disabled={isPending}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Phường" htmlFor="ward">
              <Input
                id="ward"
                name="ward"
                placeholder="VD: Thảo Điền"
                defaultValue={defaultValues.ward ?? ""}
                disabled={isPending}
              />
            </Field>
            <Field label="Đường" htmlFor="street">
              <Input
                id="street"
                name="street"
                placeholder="VD: Xa lộ Hà Nội"
                defaultValue={defaultValues.street ?? ""}
                disabled={isPending}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thông số</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Giá (VND)" htmlFor="price">
              <Input
                id="price"
                name="price"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="VD: 3500000000"
                required
                defaultValue={defaultValues.price != null ? String(defaultValues.price) : ""}
                disabled={isPending}
              />
            </Field>

            <Field label="Diện tích (m²)" htmlFor="area">
              <Input
                id="area"
                name="area"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                placeholder="VD: 72"
                required
                defaultValue={defaultValues.area != null ? String(defaultValues.area) : ""}
                disabled={isPending}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Số phòng ngủ" htmlFor="bedrooms">
              <Input
                id="bedrooms"
                name="bedrooms"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="VD: 2"
                defaultValue={defaultValues.bedrooms != null ? String(defaultValues.bedrooms) : ""}
                disabled={isPending}
              />
            </Field>

            <Field label="Số phòng tắm" htmlFor="bathrooms">
              <Input
                id="bathrooms"
                name="bathrooms"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="VD: 2"
                defaultValue={defaultValues.bathrooms != null ? String(defaultValues.bathrooms) : ""}
                disabled={isPending}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Hướng nhà" htmlFor="house_direction">
              <Select
                id="house_direction"
                name="house_direction"
                defaultValue={defaultValues.house_direction ?? ""}
                disabled={isPending}
              >
                <option value="">(Không rõ)</option>
                <option value="east">Đông</option>
                <option value="west">Tây</option>
                <option value="south">Nam</option>
                <option value="north">Bắc</option>
                <option value="southeast">Đông Nam</option>
                <option value="southwest">Tây Nam</option>
                <option value="northeast">Đông Bắc</option>
                <option value="northwest">Tây Bắc</option>
              </Select>
            </Field>

            <Field label="Pháp lý" htmlFor="legal_status">
              <Select
                id="legal_status"
                name="legal_status"
                defaultValue={defaultValues.legal_status ?? ""}
                disabled={isPending}
              >
                <option value="">(Không có)</option>
                <option value="red_book">Sổ đỏ</option>
                <option value="pink_book">Sổ hồng</option>
                <option value="sale_contract">HĐ mua bán</option>
                <option value="hand_written">Giấy tay</option>
                <option value="other">Khác</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Mặt tiền (m)" htmlFor="frontage">
              <Input
                id="frontage"
                name="frontage"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                placeholder="VD: 5"
                defaultValue={defaultValues.frontage != null ? String(defaultValues.frontage) : ""}
                disabled={isPending}
              />
            </Field>

            <Field label="Đường vào (m)" htmlFor="alley_width">
              <Input
                id="alley_width"
                name="alley_width"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                placeholder="VD: 3"
                defaultValue={defaultValues.alley_width != null ? String(defaultValues.alley_width) : ""}
                disabled={isPending}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mô tả & ghi chú</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Field label="Mô tả" htmlFor="description">
            <Textarea
              id="description"
              name="description"
              placeholder="Tổng quan căn, nội thất, view, tiện ích..."
              defaultValue={defaultValues.description ?? ""}
              disabled={isPending}
            />
          </Field>

          <Field label="Điểm mạnh" htmlFor="strengths">
            <Textarea
              id="strengths"
              name="strengths"
              placeholder="VD: view đẹp, sổ sẵn, giá tốt..."
              defaultValue={defaultValues.strengths ?? ""}
              disabled={isPending}
            />
          </Field>

          <Field label="Điểm yếu" htmlFor="weaknesses">
            <Textarea
              id="weaknesses"
              name="weaknesses"
              placeholder="VD: kẹt xe giờ cao điểm, hướng nắng..."
              defaultValue={defaultValues.weaknesses ?? ""}
              disabled={isPending}
            />
          </Field>

          <Field label="Ghi chú chủ nhà" htmlFor="owner_note">
            <Textarea
              id="owner_note"
              name="owner_note"
              placeholder="VD: chủ cần bán gấp, hỗ trợ xem nhà..."
              defaultValue={defaultValues.owner_note ?? ""}
              disabled={isPending}
            />
          </Field>

          <Field label="Ghi chú quy hoạch" htmlFor="planning_note">
            <Textarea
              id="planning_note"
              name="planning_note"
              placeholder="VD: lộ giới, quy hoạch treo..."
              defaultValue={defaultValues.planning_note ?? ""}
              disabled={isPending}
            />
          </Field>
        </CardContent>
      </Card>

      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? "Đang lưu…" : submitLabel}
      </Button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
