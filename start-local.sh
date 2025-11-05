#!/bin/bash
cd "/Users/gemau/Documents/Project ERP/abcotronics-erp-modular"
export $(cat .env.local | grep -v '^#' | grep -v '^$' | xargs)
npm run dev
