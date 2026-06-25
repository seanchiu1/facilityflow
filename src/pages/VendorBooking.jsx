import React from 'react'
import Topbar from '../components/layout/Topbar'
import { BookingForm } from '../components/BookingForm'
import { useLanguage } from '../context/LanguageContext'

export default function VendorBooking() {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col flex-1">
      <Topbar title={t('booking.title')} subtitle={t('booking.subtitle')} />
      <div className="p-6">
        <BookingForm />
      </div>
    </div>
  )
}
