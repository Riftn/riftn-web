-- Free fraction giveaways (price 0 listings).
--
-- A claim on a free listing is written by fraction-checkout as an
-- awaiting_delivery trade with nothing paid. The owner approves it by sending
-- the fractions (the normal delivery leg) or declines it (status 'declined',
-- quantity released back to the listing). These triggers word the
-- notifications for that case; paid trades read exactly as before.

CREATE OR REPLACE FUNCTION public.notify_fraction_trade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'awaiting_delivery' AND COALESCE(NEW.total_dhb, 0) = 0 AND NEW.tx_hash IS NULL THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    ) VALUES (
      NEW.seller_address, NEW.buyer_address, 'fraction_sold',
      'Claimed ' || NEW.quantity || ' free fraction' ||
        CASE WHEN NEW.quantity = 1 THEN '' ELSE 's' END ||
        ' — send them to approve, or decline',
      NEW.token_id, 'Post #' || NEW.token_id
    );
  ELSIF NEW.status = 'awaiting_delivery' THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    ) VALUES (
      NEW.seller_address, NEW.buyer_address, 'fraction_sold',
      'Paid ' || NEW.total_dhb || ' DHB for ' || NEW.quantity ||
        ' fraction' || CASE WHEN NEW.quantity = 1 THEN '' ELSE 's' END ||
        ' — transfer them to complete the sale',
      NEW.token_id, 'Post #' || NEW.token_id
    );
  ELSIF NEW.status = 'awaiting_payment' THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    ) VALUES (
      NEW.buyer_address, NEW.seller_address, 'fraction_delivered',
      'Sent you ' || NEW.quantity || ' fraction' ||
        CASE WHEN NEW.quantity = 1 THEN '' ELSE 's' END ||
        ' — pay ' || NEW.total_dhb || ' DHB to complete the trade',
      NEW.token_id, 'Post #' || NEW.token_id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_fraction_trade_settled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'settled' AND NEW.status = 'settled' THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    ) VALUES (
      CASE WHEN OLD.status = 'awaiting_delivery' THEN NEW.buyer_address ELSE NEW.seller_address END,
      CASE WHEN OLD.status = 'awaiting_delivery' THEN NEW.seller_address ELSE NEW.buyer_address END,
      'fraction_settled',
      CASE WHEN COALESCE(NEW.total_dhb, 0) = 0 AND NEW.tx_hash IS NULL THEN
        'Approved — ' || NEW.quantity || ' free fraction' ||
          CASE WHEN NEW.quantity = 1 THEN '' ELSE 's' END ||
          ' of Post #' || NEW.token_id || ' sent to you'
      ELSE
        'Trade complete — ' || NEW.quantity || ' fraction' ||
          CASE WHEN NEW.quantity = 1 THEN '' ELSE 's' END ||
          ' of Post #' || NEW.token_id || ' for ' || NEW.total_dhb || ' DHB'
      END,
      NEW.token_id, 'Post #' || NEW.token_id
    );
  ELSIF OLD.status = 'awaiting_delivery' AND NEW.status = 'declined' THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    ) VALUES (
      NEW.buyer_address, NEW.seller_address, 'fraction_offer_rejected',
      'Your claim for ' || NEW.quantity || ' free fraction' ||
        CASE WHEN NEW.quantity = 1 THEN '' ELSE 's' END ||
        ' of Post #' || NEW.token_id || ' was declined',
      NEW.token_id, 'Post #' || NEW.token_id
    );
  END IF;
  RETURN NEW;
END;
$$;
