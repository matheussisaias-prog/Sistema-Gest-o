-- Trava: prazo e gatilho que vêm da NR não podem ser alterados por nenhuma empresa.
-- O servidor também aplica esta regra; o gatilho do banco é a segunda barreira.
DELIMITER //
CREATE TRIGGER tipos_documento_trava_norma BEFORE UPDATE ON tipos_documento
FOR EACH ROW
BEGIN
  IF OLD.prazo_origem = 'norma' AND (
       NOT (NEW.prazo_origem <=> OLD.prazo_origem)
    OR NOT (NEW.prazo_valor <=> OLD.prazo_valor)
    OR NOT (NEW.prazo_unidade <=> OLD.prazo_unidade)
    OR NOT (NEW.gatilho_afastamento_dias <=> OLD.gatilho_afastamento_dias)
    OR NOT (NEW.gatilho_motivo <=> OLD.gatilho_motivo)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prazo definido pela NR: não pode ser alterado';
  END IF;
END//
DELIMITER ;
